const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool       = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

const VALID_ROLES = new Set(['admin', 'technician', 'viewer']);

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ── GET /api/profiles ────────────────────────────────────────────────────────
// Admin → all profiles; others → own profile only
router.get('/', async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      ({ rows } = await pool.query(
        `SELECT id, email, role, full_name FROM profiles ORDER BY email`,
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT id, email, role, full_name FROM profiles WHERE id = $1`,
        [req.user.id],
      ));
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/profiles/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, role, full_name FROM profiles WHERE id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/profiles/:id ────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    // Only admin can update other users; non-admin can only update own profile
    if (req.user.role !== 'admin' && req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { role, full_name } = req.body;
    const sets   = [];
    const values = [];
    let   p      = 1;

    if (role !== undefined) {
      if (!VALID_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role' });
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can change roles' });
      sets.push(`role = $${p++}`);
      values.push(role);
    }
    if (full_name !== undefined) {
      sets.push(`full_name = $${p++}`);
      values.push(full_name);
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE profiles SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${p}
       RETURNING id, email, role, full_name`,
      values,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/profiles/create-user  (admin only) ─────────────────────────────
router.post('/create-user', requireAdmin, async (req, res) => {
  const { email, password, full_name, role } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (role && !VALID_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role' });

  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const id   = uuidv4();
    const hash = await bcrypt.hash(password, 12);
    const name = full_name || email.split('@')[0];
    const assignedRole = role || 'viewer';

    await client.query('BEGIN');
    await client.query(
      'INSERT INTO users (id, email, password_hash, full_name) VALUES ($1,$2,$3,$4)',
      [id, email.toLowerCase(), hash, name],
    );
    await client.query(
      'INSERT INTO profiles (id, email, role, full_name) VALUES ($1,$2,$3,$4)',
      [id, email.toLowerCase(), assignedRole, name],
    );
    await client.query('COMMIT');

    res.status(201).json({ id, email: email.toLowerCase(), role: assignedRole, full_name: name });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ── DELETE /api/profiles/:id  (admin only) ────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  try {
    // Deleting from users cascades to profiles via FK ON DELETE CASCADE
    const result = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
