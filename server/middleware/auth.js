const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'essai-hr-secret-2026';

const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'No autorizado - Token faltante' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Prohibido - Token inválido o expirado' });
  }
};

const requireAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      return res.status(403).json({ error: 'Acceso denegado - Se requiere rol de administrador' });
    }
  });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  JWT_SECRET
};
