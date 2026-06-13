const express = require('express');
const cors = require('cors');
const path = require('path');

// Load environment variables from server/.env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const authRoutes = require('./routes/auth');
const groupsRoutes = require('./routes/groups');
const expensesRoutes = require('./routes/expenses');
const settlementsRoutes = require('./routes/settlements');

const importRoutes = require('./routes/import');

/** Port the server listens on */
const PORT = process.env.PORT || 5000;

/** Initialize the Express application */
const app = express();

// --- Global Middleware ---

/** Enable CORS for all origins or specific Vercel domains */
const CLIENT_URL = process.env.CLIENT_URL || '*';
app.use(cors({
  origin: CLIENT_URL === '*' ? '*' : CLIENT_URL.split(','),
  credentials: true
}));

/** Parse incoming JSON request bodies */
app.use(express.json());

/** Parse URL-encoded request bodies */
app.use(express.urlencoded({ extended: true }));

// --- Route Mounting ---

/** Authentication routes (register, login, me) */
app.use('/api/auth', authRoutes);

/** Groups and balances routes */
app.use('/api/groups', groupsRoutes);

/** Expenses routes nested under a group */
app.use('/api/groups/:groupId/expenses', expensesRoutes);

/** Settlements routes nested under a group */
app.use('/api/groups/:groupId/settlements', settlementsRoutes);

/** Import routes nested under a group */
app.use('/api/groups/:groupId/import', importRoutes);

// --- Health Check ---

/**
 * GET / - Simple health check endpoint to verify the server is running.
 */
app.get('/', (req, res) => {
  return res.json({
    status: 'ok',
    message: 'SpreeTail Expense Tracker API is running.',
    timestamp: new Date().toISOString(),
  });
});

// --- 404 Handler ---

/**
 * Catch-all handler for undefined routes.
 */
app.use((req, res) => {
  return res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// --- Global Error Handler ---

/**
 * Express error-handling middleware for unexpected errors.
 */
app.use((err, req, res, _next) => {
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

// --- Start Server ---

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
