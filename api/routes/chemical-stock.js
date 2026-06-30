const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool        = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

function requireTechnician(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'technician') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
}

// Whitelisted columns for inserts/updates and ORDER BY (SQL-injection safe)
const COLUMNS = [
  'name', 'cas_number', 'storage_class', 'location',
  'health', 'fire', 'instability', 'special',
  'quantity', 'unit', 'min_stock', 'expiry_date', 'supplier', 'notes',
];
const ORDERABLE = new Set([...COLUMNS, 'id', 'created_at', 'updated_at']);

// ── GET /api/chemical-stock ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { order_by, order_dir, limit } = req.query;
    let sql = 'SELECT * FROM chemical_stock';

    const col = ORDERABLE.has(order_by) ? order_by : 'name';
    const dir = String(order_dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${col} ${dir}`;

    const lim = parseInt(limit, 10);
    const vals = [];
    if (Number.isInteger(lim) && lim > 0) {
      vals.push(lim);
      sql += ` LIMIT $${vals.length}`;
    }

    const { rows } = await pool.query(sql, vals);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/chemical-stock/:id ──────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM chemical_stock WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildInsert(body) {
  const id = body.id || uuidv4();
  const cols = ['id'];
  const ph   = ['$1'];
  const vals = [id];
  let p = 2;
  for (const c of COLUMNS) {
    if (c in body) {
      cols.push(c);
      ph.push(`$${p++}`);
      vals.push(body[c]);
    }
  }
  return {
    text: `INSERT INTO chemical_stock (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING *`,
    vals,
  };
}

// ── POST /api/chemical-stock  (single object or array) ───────────────────────
router.post('/', requireTechnician, async (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      const out = [];
      for (const item of req.body) {
        const { text, vals } = buildInsert(item);
        const { rows } = await pool.query(text, vals);
        out.push(rows[0]);
      }
      return res.status(201).json(out);
    }
    const { text, vals } = buildInsert(req.body);
    const { rows } = await pool.query(text, vals);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/chemical-stock/:id ──────────────────────────────────────────────
router.put('/:id', requireTechnician, async (req, res) => {
  try {
    const data = req.body;
    const sets = [];
    const vals = [];
    let p = 1;
    for (const c of [...COLUMNS, 'updated_at']) {
      if (c in data) {
        sets.push(`${c} = $${p++}`);
        vals.push(data[c]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE chemical_stock SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      vals,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/chemical-stock/:id ───────────────────────────────────────────
router.delete('/:id', requireTechnician, async (req, res) => {
  try {
    await pool.query('DELETE FROM chemical_stock WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
