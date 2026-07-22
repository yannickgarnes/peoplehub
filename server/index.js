require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { getDb } = require('./database/db');

const authRoutes = require('./routes/auth');
const workersRoutes = require('./routes/workers');
const vacationsRoutes = require('./routes/vacations');
const absencesRoutes = require('./routes/absences');
const documentsRoutes = require('./routes/documents');
const importRoutes = require('./routes/import');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Serve static files from public/
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/workers', workersRoutes);
app.use('/api/vacations', vacationsRoutes);
app.use('/api/absences', absencesRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/import', importRoutes);

// SPA Fallback: serve index.html for all non-API routes
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ error: 'Error interno del servidor' });
});

const startServer = async () => {
    try {
        console.log('Initializing database...');
        await getDb();
        console.log('Database initialized.');

        // Only listen on a port in local development
        // Vercel handles this automatically via the exported app
        if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
            app.listen(PORT, () => {
                console.log(`Server started! Listening on http://localhost:${PORT}`);
            });
        }
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

startServer();

// Export app for Vercel serverless
module.exports = app;
