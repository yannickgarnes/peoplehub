const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    const db = await getDb();
    const { worker_id, company_id, tipo, requiere_firma } = req.body;
    
    // Check if worker exists to get their company_id if not provided
    let finalCompanyId = company_id;
    if (!finalCompanyId && worker_id) {
        const workers = db.query('SELECT company_id FROM workers WHERE id = ?', [worker_id]);
        if (workers.length > 0) {
            finalCompanyId = workers[0].company_id;
        }
    }

    const nombreArchivo = req.file.originalname;
    const rutaArchivo = `/uploads/${req.file.filename}`;
    
    const query = `
      INSERT INTO documents (worker_id, company_id, tipo, nombre, ruta_archivo, requiere_firma)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
        worker_id || null, 
        finalCompanyId || null, 
        tipo || 'otro', 
        nombreArchivo, 
        rutaArchivo, 
        requiere_firma === 'true' || requiere_firma === '1' ? 1 : 0
    ];
    
    const result = db.runQuery(query, params);
    
    res.status(201).json({ 
        message: 'Documento subido exitosamente', 
        id: result.lastInsertRowid,
        ruta: rutaArchivo
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const { worker_id, company_id, tipo } = req.query;
    
    let query = `
      SELECT d.*, 
             w.nombre as worker_nombre, w.apellido1 as worker_apellido, 
             c.name as company_name 
      FROM documents d
      LEFT JOIN workers w ON d.worker_id = w.id
      LEFT JOIN companies c ON d.company_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role !== 'admin') {
      // Employee sees documents assigned to them OR company documents that aren't specific to a worker?
      // Typically an employee should see their own documents. The prompt says "employee have read-only + sign documents"
      // Let's assume they only see their own worker documents and maybe general company ones. 
      // I'll restrict to their own documents for security.
      query += ` AND d.worker_id = ?`;
      params.push(req.user.worker_id);
    } else {
      if (worker_id) {
        query += ` AND d.worker_id = ?`;
        params.push(worker_id);
      }
      if (company_id) {
        query += ` AND d.company_id = ?`;
        params.push(company_id);
      }
      if (tipo) {
        query += ` AND d.tipo = ?`;
        params.push(tipo);
      }
    }

    const documents = db.query(query, params);
    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    
    const documents = db.query('SELECT * FROM documents WHERE id = ?', [id]);
    
    if (documents.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    const doc = documents[0];
    
    if (req.user.role !== 'admin' && doc.worker_id !== req.user.worker_id) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    // ruta_archivo looks like /uploads/filename
    const filePath = path.join(__dirname, '..', '..', 'public', doc.ruta_archivo);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Archivo no encontrado en el servidor' });
    }
    
    res.download(filePath, doc.nombre);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id/sign', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    const { codigo_firma, autorizaciones } = req.body;
    
    const documents = db.query('SELECT * FROM documents WHERE id = ?', [id]);
    
    if (documents.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    
    const doc = documents[0];
    
    if (req.user.role !== 'admin' && doc.worker_id !== req.user.worker_id) {
        return res.status(403).json({ error: 'Acceso denegado' });
    }
    
    if (!doc.requiere_firma) {
        return res.status(400).json({ error: 'Este documento no requiere firma' });
    }

    // Verify worker code if provided
    if (req.user.role !== 'admin' && codigo_firma) {
        const userRows = db.query('SELECT * FROM users WHERE worker_id = ?', [req.user.worker_id]);
        if (userRows.length > 0) {
            const workerRows = db.query('SELECT dni FROM workers WHERE id = ?', [req.user.worker_id]);
            const cleanCode = codigo_firma.trim().toUpperCase().replace(/[\s-]/g, '');
            const cleanDni = workerRows[0]?.dni?.trim().toUpperCase().replace(/[\s-]/g, '');
            if (cleanDni && cleanCode !== cleanDni) {
                return res.status(400).json({ error: 'El código de firma / DNI no coincide' });
            }
        }
    }

    const autorizacionesJson = JSON.stringify(autorizaciones || {});
    
    db.runQuery(
        'UPDATE documents SET firmado = 1, fecha_firma = ?, codigo_firma = ?, autorizaciones = ? WHERE id = ?', 
        [new Date().toISOString(), codigo_firma || 'FIRMA-DIGITAL', autorizacionesJson, id]
    );
    
    res.json({ message: 'Documento y autorizaciones firmados exitosamente' });
  } catch (error) {
    console.error('Error signing document:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    
    const documents = db.query('SELECT ruta_archivo FROM documents WHERE id = ?', [id]);
    if (documents.length > 0) {
        const filePath = path.join(__dirname, '..', '..', 'public', documents[0].ruta_archivo);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    
    db.runQuery('DELETE FROM documents WHERE id = ?', [id]);
    res.json({ message: 'Documento eliminado exitosamente' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
