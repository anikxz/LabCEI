const express = require('express');
const router  = express.Router();
const pool        = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

function requireTechnician(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'technician') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
}

const COLUMNS = [
  'type', 'category', 'description', 'location',
  'retention', 'status', 'notes', 'revision', 'date', 'files',
];
const ORDERABLE = new Set([...COLUMNS, 'id', 'created_at', 'updated_at']);

// `files` is JSONB — stringify objects/arrays before binding.
function bind(col, val) {
  if (col === 'files') return JSON.stringify(val ?? []);
  return val;
}

// ── GET /api/iso-documents ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { order_by, order_dir, limit } = req.query;
    let sql = 'SELECT * FROM iso_documents';

    const col = ORDERABLE.has(order_by) ? order_by : 'id';
    const dir = String(order_dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${col} ${dir}`;

    const vals = [];
    const lim = parseInt(limit, 10);
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

// ── GET /api/iso-documents/:id ───────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM iso_documents WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildInsert(body) {
  if (!body.id) throw new Error('iso_documents requires an id');
  const cols = ['id'];
  const ph   = ['$1'];
  const vals = [body.id];
  let p = 2;
  for (const c of COLUMNS) {
    if (c in body) {
      cols.push(c);
      ph.push(`$${p++}`);
      vals.push(bind(c, body[c]));
    }
  }
  return {
    text: `INSERT INTO iso_documents (${cols.join(',')}) VALUES (${ph.join(',')})
           ON CONFLICT (id) DO NOTHING RETURNING *`,
    vals,
  };
}

// ── POST /api/iso-documents  (single object or array for seeding) ────────────
router.post('/', requireTechnician, async (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      const out = [];
      for (const item of req.body) {
        const { text, vals } = buildInsert(item);
        const { rows } = await pool.query(text, vals);
        if (rows[0]) out.push(rows[0]);
      }
      return res.status(201).json(out);
    }
    const { text, vals } = buildInsert(req.body);
    const { rows } = await pool.query(text, vals);
    res.status(201).json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/iso-documents/:id ───────────────────────────────────────────────
router.put('/:id', requireTechnician, async (req, res) => {
  try {
    const data = req.body;
    const sets = [];
    const vals = [];
    let p = 1;
    for (const c of COLUMNS) {
      if (c in data) {
        sets.push(`${c} = $${p++}`);
        vals.push(bind(c, data[c]));
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE iso_documents SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
      vals,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/iso-documents/:id ────────────────────────────────────────────
router.delete('/:id', requireTechnician, async (req, res) => {
  try {
    await pool.query('DELETE FROM iso_documents WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
