/**
 * server.js — NearChat API Server
 *
 * Stack:
 *   Express  — REST API (auth + user discovery)
 *   ws       — WebSocket server (real-time messaging + presence)
 *   bcryptjs — password hashing
 *   jsonwebtoken — stateless JWT auth
 *
 * Start:
 *   npm install
 *   node server.js          (production)
 *   npm run dev             (hot-reload with nodemon)
 *
 * Environment variables (create a .env file or set in your shell):
 *   PORT=3001
 *   JWT_SECRET=your_long_random_secret
 *   CLIENT_ORIGIN=http://localhost:3000
 */

require('dotenv').config({ path: '.env' });

const http    = require('http');
const express = require('express');
const cors    = require('cors');

const authRouter  = require('./routes/auth');
const usersRouter = require('./routes/users');
const { attachWebSocketServer } = require('./utils/websocket');
const { seedDemoUsers }         = require('./utils/store');

// ─── App setup ────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

// Middleware
app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true,
}));
app.use(express.json());

app.use(require('express').static(require('path').join(__dirname, 'public')));

// Request logger (dev)
app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.path}`);
  next();
});

// ─── REST Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth',  authRouter);
app.use('/api/users', usersRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────
const server = http.createServer(app);
attachWebSocketServer(server);

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, async () => {
  await seedDemoUsers();
  console.log(`\n🟢 NearChat server running`);
  console.log(`   REST  → http://localhost:${PORT}/api`);
  console.log(`   WS    → ws://localhost:${PORT}/ws`);
  console.log(`   Health→ http://localhost:${PORT}/health\n`);
});
