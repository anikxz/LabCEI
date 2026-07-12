/**
 * LabCEI — Express REST API
 *
 * Start:
 *   cd api && npm install && npm start
 *   (or: npm run dev   for nodemon auto-reload)
 *
 * Set DATABASE_URL, JWT_SECRET, etc. in the root .env file.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const cors    = require('cors');

// ── Fail fast on missing/insecure config ─────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET is missing or too short (need ≥ 32 chars).');
  console.error('Generate one: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' &&
    process.env.JWT_SECRET === 'dev_secret_change_in_production') {
  console.error('FATAL: Refusing to start in production with the default JWT_SECRET.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Always allow common local dev origins
const devOrigins = [
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
  'http://localhost:3000',
  'http://localhost:19006',
  'http://localhost:19000',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8082',
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return cb(null, true);
    const whitelist = [...devOrigins, ...allowedOrigins];
    if (whitelist.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',                  require('./routes/auth'));
app.use('/api/instruments',           require('./routes/instruments'));
app.use('/api/maintenance-logs',      require('./routes/logs'));
app.use('/api/profiles',              require('./routes/profiles'));
app.use('/api/documents',             require('./routes/documents'));
app.use('/api/notification-settings', require('./routes/notification-settings'));
app.use('/api/notifications-log',     require('./routes/notifications-log'));
app.use('/api/functions',             require('./routes/functions'));
app.use('/api/storage',               require('./routes/storage'));
app.use('/api/chemical-stock',        require('./routes/chemical-stock'));
app.use('/api/chemical-activity',     require('./routes/chemical-activity'));
app.use('/api/iso-documents',         require('./routes/iso-documents'));
app.use('/api/iso-document-activity', require('./routes/iso-document-activity'));

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack || err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Periodic cleanup of expired refresh tokens ───────────────────────────────
const pool = require('./db');
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly
async function pruneExpiredRefreshTokens() {
  try {
    await pool.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
  } catch (err) {
    console.error('refresh-token cleanup failed:', err.message);
  }
}
const cleanupTimer = setInterval(pruneExpiredRefreshTokens, CLEANUP_INTERVAL_MS);
cleanupTimer.unref(); // don't keep the process alive just for cleanup
pruneExpiredRefreshTokens(); // run once on startup

// ── Automated notification digest scheduler ──────────────────────────────────
// Runs the digest routine on an interval; per-user cadence (daily/weekly) and
// last_sent_at gating inside runDigest prevent duplicate sends, so a frequent
// tick is safe and robust across restarts. Disable with NOTIFY_SCHEDULER=off.
if ((process.env.NOTIFY_SCHEDULER || 'on').toLowerCase() !== 'off') {
  const { runDigest } = require('./routes/functions');
  const DIGEST_INTERVAL_MS = parseInt(process.env.NOTIFY_INTERVAL_MS || '', 10) || 60 * 60 * 1000; // hourly
  async function runScheduledDigest() {
    try {
      const { sent, skipped } = await runDigest({});
      if (sent > 0) console.log(`[scheduler] digest sent to ${sent} user(s), ${skipped} skipped`);
    } catch (err) {
      console.error('[scheduler] digest failed:', err.message);
    }
  }
  const digestTimer = setInterval(runScheduledDigest, DIGEST_INTERVAL_MS);
  digestTimer.unref();
  // Kick off shortly after startup (delay so the DB pool is warm)
  setTimeout(runScheduledDigest, 30 * 1000).unref();
  console.log(`[scheduler] notification digest every ${Math.round(DIGEST_INTERVAL_MS / 60000)} min`);
}

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`\nLabCEI API  →  http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
