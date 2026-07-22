const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Faltan credenciales' });
    }

    const db = await getDb();
    
    const users = db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    db.runQuery('UPDATE users SET ultimo_acceso = ? WHERE id = ?', [new Date().toISOString(), user.id]);

    const token = jwt.sign(
      { id: user.id, worker_id: user.worker_id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({
      message: 'Inicio de sesión exitoso',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        worker_id: user.worker_id
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Sesión cerrada exitosamente' });
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = await getDb();
    let userData = { ...req.user };

    if (userData.worker_id) {
      const workers = db.query(`
        SELECT w.*, c.name as company_name 
        FROM workers w 
        LEFT JOIN companies c ON w.company_id = c.id 
        WHERE w.id = ?
      `, [userData.worker_id]);
      
      if (workers.length > 0) {
        userData.worker = workers[0];
      }
    }

    res.json(userData);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
