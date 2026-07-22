const express = require('express');
const { getDb } = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const { worker_id, company_id, tipo } = req.query;
    
    let query = `
      SELECT a.*, w.nombre, w.apellido1, w.apellido2, c.name as company_name 
      FROM absences a
      JOIN workers w ON a.worker_id = w.id
      JOIN companies c ON w.company_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role !== 'admin') {
      query += ` AND a.worker_id = ?`;
      params.push(req.user.worker_id);
    } else {
      if (worker_id) {
        query += ` AND a.worker_id = ?`;
        params.push(worker_id);
      }
      if (company_id) {
        query += ` AND w.company_id = ?`;
        params.push(company_id);
      }
      if (tipo) {
        query += ` AND a.tipo = ?`;
        params.push(tipo);
      }
    }

    const absences = db.query(query, params);
    res.json(absences);
  } catch (error) {
    console.error('Error fetching absences:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const a = req.body;
    
    const query = `
      INSERT INTO absences (worker_id, tipo, fecha_inicio, fecha_fin, horas, observaciones)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [a.worker_id, a.tipo, a.fecha_inicio, a.fecha_fin, a.horas, a.observaciones];
    
    const result = db.runQuery(query, params);
    res.status(201).json({ message: 'Ausencia registrada exitosamente', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error creating absence:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    const a = req.body;
    
    const query = `
      UPDATE absences SET
        tipo = COALESCE(?, tipo),
        fecha_inicio = COALESCE(?, fecha_inicio),
        fecha_fin = COALESCE(?, fecha_fin),
        horas = COALESCE(?, horas),
        observaciones = COALESCE(?, observaciones)
      WHERE id = ?
    `;
    
    const params = [a.tipo, a.fecha_inicio, a.fecha_fin, a.horas, a.observaciones, id];
    
    db.runQuery(query, params);
    res.json({ message: 'Ausencia actualizada exitosamente' });
  } catch (error) {
    console.error('Error updating absence:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    db.runQuery('DELETE FROM absences WHERE id = ?', [req.params.id]);
    res.json({ message: 'Ausencia eliminada exitosamente' });
  } catch (error) {
    console.error('Error deleting absence:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
