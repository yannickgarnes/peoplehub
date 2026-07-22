const express = require('express');
const { getDb } = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const { worker_id, company_id, month, year } = req.query;
    
    let query = `
      SELECT v.*, w.nombre, w.apellido1, w.apellido2, c.name as company_name 
      FROM vacations v
      JOIN workers w ON v.worker_id = w.id
      JOIN companies c ON w.company_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role !== 'admin') {
      query += ` AND v.worker_id = ?`;
      params.push(req.user.worker_id);
    } else {
      if (worker_id) {
        query += ` AND v.worker_id = ?`;
        params.push(worker_id);
      }
      if (company_id) {
        query += ` AND w.company_id = ?`;
        params.push(company_id);
      }
    }

    if (month && year) {
        query += ` AND (strftime('%m', v.fecha_inicio) = ? AND strftime('%Y', v.fecha_inicio) = ?)`;
        // Pad month with 0 if necessary
        params.push(month.toString().padStart(2, '0'), year.toString());
    }

    const vacations = db.query(query, params);
    res.json(vacations);
  } catch (error) {
    console.error('Error fetching vacations:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/calendar', authenticateToken, async (req, res) => {
    try {
        const db = await getDb();
        let query = `
          SELECT v.id, v.worker_id, v.fecha_inicio, v.fecha_fin, v.tipo, v.estado,
                 w.nombre, w.apellido1, w.apellido2, c.name as company_name 
          FROM vacations v
          JOIN workers w ON v.worker_id = w.id
          JOIN companies c ON w.company_id = c.id
          WHERE 1=1
        `;
        const params = [];
        
        if (req.user.role !== 'admin') {
            // Employee only sees their own calendar ? Wait, requirements say "all vacations (admin) or own (employee)"
            // BUT calendar view might be meant for everyone or just admin? The instruction says: "returns data structured for calendar view"
            // Let's assume employee only sees their own if not admin, or maybe they can see everyone's?
            // "all vacations (admin) or own (employee)" - let's enforce this.
            query += ` AND v.worker_id = ?`;
            params.push(req.user.worker_id);
        }
        
        const vacations = db.query(query, params);
        
        // Group by worker
        const calendarDataMap = new Map();
        
        vacations.forEach(v => {
            if (!calendarDataMap.has(v.worker_id)) {
                calendarDataMap.set(v.worker_id, {
                    worker_id: v.worker_id,
                    nombre: v.nombre,
                    apellidos: `${v.apellido1 || ''} ${v.apellido2 || ''}`.trim(),
                    company: v.company_name,
                    dates: []
                });
            }
            
            calendarDataMap.get(v.worker_id).dates.push({
                id: v.id,
                fecha_inicio: v.fecha_inicio,
                fecha_fin: v.fecha_fin,
                tipo: v.tipo,
                estado: v.estado
            });
        });
        
        res.json(Array.from(calendarDataMap.values()));
    } catch (error) {
        console.error('Error fetching calendar data:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const v = req.body;
    
    const query = `
      INSERT INTO vacations (worker_id, fecha_inicio, fecha_fin, dias, tipo, estado, notas)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
        v.worker_id, v.fecha_inicio, v.fecha_fin, v.dias, 
        v.tipo || 'vacaciones', v.estado || 'aprobado', v.notas
    ];
    
    const result = db.runQuery(query, params);
    res.status(201).json({ message: 'Vacaciones registradas exitosamente', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error creating vacation:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    const v = req.body;
    
    const query = `
      UPDATE vacations SET
        fecha_inicio = COALESCE(?, fecha_inicio),
        fecha_fin = COALESCE(?, fecha_fin),
        dias = COALESCE(?, dias),
        tipo = COALESCE(?, tipo),
        estado = COALESCE(?, estado),
        notas = COALESCE(?, notas)
      WHERE id = ?
    `;
    
    const params = [v.fecha_inicio, v.fecha_fin, v.dias, v.tipo, v.estado, v.notas, id];
    
    db.runQuery(query, params);
    res.json({ message: 'Vacaciones actualizadas exitosamente' });
  } catch (error) {
    console.error('Error updating vacation:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    db.runQuery('DELETE FROM vacations WHERE id = ?', [req.params.id]);
    res.json({ message: 'Vacaciones eliminadas exitosamente' });
  } catch (error) {
    console.error('Error deleting vacation:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
