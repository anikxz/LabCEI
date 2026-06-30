const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const ACCESS_EXPIRY       = '15m';
const REFRESH_EXPIRY_DAYS = 7;
const REFRESH_EXPIRY_MS   = REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

function makeTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role || 'viewer' };
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
  const refreshToken = uuidv4();
  return { accessToken, refreshToken };
}

// ── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { email, password, full_name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId       = uuidv4();
    const name         = full_name || email.split('@')[0];

    const userData              = { id: userId, email: email.toLowerCase(), role: 'viewer', full_name: name };
    const { accessToken, refreshToken } = makeTokens(userData);
    const expiresAt             = new Date(Date.now() + REFRESH_EXPIRY_MS);

    await client.query('BEGIN');
    await client.query(
      'INSERT INTO users (id, email, password_hash, full_name) VALUES ($1,$2,$3,$4)',
      [userId, email.toLowerCase(), passwordHash, name],
    );
    await client.query(
      'INSERT INTO profiles (id, email, role, full_name) VALUES ($1,$2,$3,$4)',
      [userId, email.toLowerCase(), 'viewer', name],
    );
    await client.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)',
      [userId, refreshToken, expiresAt],
    );
    await client.query('COMMIT');

    res.status(201).json({
      access_token:  accessToken,
      refresh_token: refreshToken,
      user:          userData,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('signup error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, COALESCE(p.role,'viewer') AS role
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase()],
    );

    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user  = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const userData                      = { id: user.id, email: user.email, role: user.role, full_name: user.full_name };
    const { accessToken, refreshToken } = makeTokens(userData);
    const expiresAt                     = new Date(Date.now() + REFRESH_EXPIRY_MS);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)',
      [user.id, refreshToken, expiresAt],
    );

    res.json({ access_token: accessToken, refresh_token: refreshToken, user: userData });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token required' });

  try {
    const { rows } = await pool.query(
      `SELECT rt.user_id, rt.expires_at, u.email, u.full_name, COALESCE(p.role,'viewer') AS role
       FROM refresh_tokens rt
       JOIN  users    u ON u.id = rt.user_id
       LEFT JOIN profiles p ON p.id = rt.user_id
       WHERE rt.token = $1`,
      [refresh_token],
    );

    if (rows.length === 0) return res.status(401).json({ error: 'Invalid refresh token' });

    const row = rows[0];
    if (new Date(row.expires_at) < new Date()) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refresh_token]);
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    const userData                      = { id: row.user_id, email: row.email, role: row.role, full_name: row.full_name };
    const { accessToken, refreshToken: newRefresh } = makeTokens(userData);

    // Rotate refresh token
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refresh_token]);
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)',
      [row.user_id, newRefresh, expiresAt],
    );

    res.json({ access_token: accessToken, refresh_token: newRefresh });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  const { refresh_token } = req.body;
  if (refresh_token) {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refresh_token]).catch(() => {});
  }
  res.json({ success: true });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.full_name, COALESCE(p.role,'viewer') AS role
       FROM users u LEFT JOIN profiles p ON p.id = u.id
       WHERE u.id = $1`,
      [req.user.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
