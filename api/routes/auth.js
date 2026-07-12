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

// ── HRMS (external directory) auth config ────────────────────────────────────
const HRMS_AUTH_URL = process.env.HRMS_AUTH_URL || '';
const HRMS_SYS_NAME = process.env.HRMS_SYS_NAME || 'global_report';
const HRMS_TIMEOUT_MS = 8000;

function makeTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role || 'viewer' };
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
  const refreshToken = uuidv4();
  return { accessToken, refreshToken };
}

/**
 * Verify credentials against the HRMS directory.
 * Returns { ok: true, fullName } on success, { ok: false } on rejection,
 * or null if HRMS is disabled/unreachable (so callers can decide the fallback).
 */
async function checkHrms(userId, password) {
  if (!HRMS_AUTH_URL) return null;
  const url = `${HRMS_AUTH_URL}?userId=${encodeURIComponent(userId)}` +
              `&userPass=${encodeURIComponent(password)}` +
              `&sysName=${encodeURIComponent(HRMS_SYS_NAME)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HRMS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    const ok = data.auth === true || data.auth === 'true' || data.authenticated === true;
    if (!ok) return { ok: false };
    return { ok: true, fullName: data.fullName || data.userName || data.name || null };
  } catch (err) {
    console.error('HRMS auth error:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Find (or auto-provision) a local user + profile for an HRMS-authenticated login. */
async function ensureHrmsUser(loginId, fullName) {
  const existing = await pool.query(
    `SELECT u.id, u.email, u.full_name, COALESCE(p.role,'viewer') AS role
     FROM users u LEFT JOIN profiles p ON p.id = u.id
     WHERE u.email = $1`,
    [loginId],
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const client = await pool.connect();
  try {
    const userId = uuidv4();
    const name   = fullName || loginId.split('@')[0];
    // HRMS users authenticate remotely; store an unusable local hash so they can
    // never sign in via the local password path.
    const placeholderHash = await bcrypt.hash(uuidv4(), 12);

    await client.query('BEGIN');
    await client.query(
      'INSERT INTO users (id, email, password_hash, full_name) VALUES ($1,$2,$3,$4)',
      [userId, loginId, placeholderHash, name],
    );
    await client.query(
      'INSERT INTO profiles (id, email, role, full_name) VALUES ($1,$2,$3,$4)',
      [userId, loginId, 'viewer', name],
    );
    await client.query('COMMIT');
    return { id: userId, email: loginId, full_name: name, role: 'viewer' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Issue an access + refresh token pair and persist the refresh token. */
async function issueSession(res, user) {
  const userData = {
    id: user.id, email: user.email, role: user.role || 'viewer', full_name: user.full_name,
  };
  const { accessToken, refreshToken } = makeTokens(userData);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)',
    [user.id, refreshToken, expiresAt],
  );
  return res.json({ access_token: accessToken, refresh_token: refreshToken, user: userData });
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
// Accepts either a locally-created account (email + password) OR an HRMS
// directory credential (username + password). Local auth is tried first; if it
// doesn't match, the credential is verified against HRMS and the user is
// auto-provisioned locally on success.
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const loginId = String(email).trim().toLowerCase();

  try {
    // 1) Local account (manually created users)
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, COALESCE(p.role,'viewer') AS role
       FROM users u
       LEFT JOIN profiles p ON p.id = u.id
       WHERE u.email = $1`,
      [loginId],
    );

    if (rows.length > 0) {
      const user  = rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (valid) return await issueSession(res, user);
    }

    // 2) HRMS directory credential (username + password)
    const hrms = await checkHrms(email, password);
    if (hrms && hrms.ok) {
      const user = await ensureHrmsUser(loginId, hrms.fullName);
      return await issueSession(res, user);
    }

    return res.status(401).json({ error: 'Invalid credentials' });
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
