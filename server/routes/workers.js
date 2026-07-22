const express = require('express');
const { getDb } = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    const { company_id, search } = req.query;
    
    let query = `
      SELECT w.*, c.name as company_name 
      FROM workers w 
      LEFT JOIN companies c ON w.company_id = c.id 
      WHERE 1=1
    `;
    const params = [];

    // Filter for non-admins to only see themselves
    if (req.user.role !== 'admin') {
      query += ` AND w.id = ?`;
      params.push(req.user.worker_id);
    } else {
      if (company_id) {
        query += ` AND w.company_id = ?`;
        params.push(company_id);
      }
      
      if (search) {
        query += ` AND (w.nombre LIKE ? OR w.apellido1 LIKE ? OR w.apellido2 LIKE ? OR w.dni LIKE ? OR w.email LIKE ?)`;
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }
    }

    const workers = db.query(query, params);
    res.json({ workers });
  } catch (error) {
    console.error('Error fetching workers:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const workerId = parseInt(req.params.id);
    
    if (req.user.role !== 'admin' && req.user.worker_id !== workerId) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const db = await getDb();
    const workers = db.query(`
      SELECT w.*, c.name as company_name 
      FROM workers w 
      LEFT JOIN companies c ON w.company_id = c.id 
      WHERE w.id = ?
    `, [workerId]);

    if (workers.length === 0) {
      return res.status(404).json({ error: 'Trabajador no encontrado' });
    }

    res.json({ worker: workers[0] });
  } catch (error) {
    console.error('Error fetching worker:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const w = req.body;
    
    const query = `
      INSERT INTO workers (
        company_id, nombre, apellido1, apellido2, dni, naf, 
        fecha_nacimiento, fecha_alta, fecha_antiguedad, puesto, 
        email, ubicacion, revision_medica, formacion_prl, prl_modo, 
        carnet_carretillero, carnet_3a_3b, estado, telefono, direccion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      w.company_id, w.nombre, w.apellido1, w.apellido2, w.dni, w.naf,
      w.fecha_nacimiento, w.fecha_alta, w.fecha_antiguedad, w.puesto,
      w.email, w.ubicacion, w.revision_medica, w.formacion_prl, w.prl_modo,
      w.carnet_carretillero, w.carnet_3a_3b, w.estado || 'activo', w.telefono, w.direccion
    ];
    
    const result = db.runQuery(query, params);
    res.status(201).json({ message: 'Trabajador creado exitosamente', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Error creating worker:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const id = req.params.id;
    const w = req.body;
    
    const query = `
      UPDATE workers SET
        company_id = COALESCE(?, company_id),
        nombre = COALESCE(?, nombre),
        apellido1 = COALESCE(?, apellido1),
        apellido2 = COALESCE(?, apellido2),
        dni = COALESCE(?, dni),
        naf = COALESCE(?, naf),
        fecha_nacimiento = COALESCE(?, fecha_nacimiento),
        fecha_alta = COALESCE(?, fecha_alta),
        fecha_antiguedad = COALESCE(?, fecha_antiguedad),
        puesto = COALESCE(?, puesto),
        email = COALESCE(?, email),
        ubicacion = COALESCE(?, ubicacion),
        revision_medica = COALESCE(?, revision_medica),
        formacion_prl = COALESCE(?, formacion_prl),
        prl_modo = COALESCE(?, prl_modo),
        carnet_carretillero = COALESCE(?, carnet_carretillero),
        carnet_3a_3b = COALESCE(?, carnet_3a_3b),
        fecha_baja = COALESCE(?, fecha_baja),
        estado = COALESCE(?, estado),
        telefono = COALESCE(?, telefono),
        direccion = COALESCE(?, direccion)
      WHERE id = ?
    `;
    
    const params = [
      w.company_id, w.nombre, w.apellido1, w.apellido2, w.dni, w.naf,
      w.fecha_nacimiento, w.fecha_alta, w.fecha_antiguedad, w.puesto,
      w.email, w.ubicacion, w.revision_medica, w.formacion_prl, w.prl_modo,
      w.carnet_carretillero, w.carnet_3a_3b, w.fecha_baja, w.estado, w.telefono, w.direccion,
      id
    ];
    
    db.runQuery(query, params);
    res.json({ message: 'Trabajador actualizado exitosamente' });
  } catch (error) {
    console.error('Error updating worker:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    db.runQuery('DELETE FROM workers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Trabajador eliminado exitosamente' });
  } catch (error) {
    console.error('Error deleting worker:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.get('/:id/vacation-balance', authenticateToken, async (req, res) => {
  try {
    const workerId = parseInt(req.params.id);
    
    if (req.user.role !== 'admin' && req.user.worker_id !== workerId) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const db = await getDb();
    const workers = db.query('SELECT fecha_alta FROM workers WHERE id = ?', [workerId]);
    
    if (workers.length === 0) {
      return res.status(404).json({ error: 'Trabajador no encontrado' });
    }

    const worker = workers[0];
    
    // Default total is 22
    let totalDias = 22;
    
    if (worker.fecha_alta) {
        const fechaAlta = new Date(worker.fecha_alta);
        const currentYear = new Date().getFullYear(); // or 2026 as per requirement
        const yearToCheck = 2026;
        
        if (fechaAlta.getFullYear() === yearToCheck) {
            // calculate pro-rated days
            const startOfYear = new Date(yearToCheck, 0, 1);
            const endOfYear = new Date(yearToCheck, 11, 31);
            const daysInYear = Math.floor((endOfYear - startOfYear) / (1000 * 60 * 60 * 24)) + 1;
            const daysFromAlta = Math.floor((endOfYear - fechaAlta) / (1000 * 60 * 60 * 24)) + 1;
            
            totalDias = Math.round(22 * daysFromAlta / daysInYear);
        }
    }

    const vacations = db.query(
        "SELECT SUM(dias) as dias_usados FROM vacations WHERE worker_id = ? AND tipo = 'vacaciones' AND estado = 'aprobado'", 
        [workerId]
    );
    
    const diasUsados = vacations[0].dias_usados || 0;
    const diasRestantes = totalDias - diasUsados;

    res.json({
        total: totalDias,
        usados: diasUsados,
        restantes: diasRestantes
    });
  } catch (error) {
    console.error('Error calculating vacation balance:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
