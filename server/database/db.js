/**
 * db.js - Entry point for database access
 * Delegates to db-universal.js which handles both Turso (production) and sql.js (local)
 */
module.exports = require('./db-universal');
