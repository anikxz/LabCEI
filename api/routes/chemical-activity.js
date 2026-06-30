const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool        = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

const ORDERABLE = new Set(['time', 'action', 'chemical_id', 'id']);

// ── GET /api/chemical-activity?chemical_id=...&order_by=time&order_dir=desc&limit=20
router.get('/', async (req, res) => {
  try {
    const { chemical_id, order_by, order_dir, limit } = req.query;
    let sql = 'SELECT * FROM chemical_activity';
    const vals = [];

    if (chemical_id) {
      vals.push(chemical_id);
      sql += ` WHERE chemical_id = $${vals.length}`;
    }

    const col = ORDERABLE.has(order_by) ? order_by : 'time';
    const dir = String(order_dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${col} ${dir}`;

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

// ── POST /api/chemical-activity  (append-only audit entry) ───────────────────
router.post('/', async (req, res) => {
  try {
    const b  = req.body;
    const id = b.id || uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO chemical_activity (id, chemical_id, action, description, logged_by, time)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
       RETURNING *`,
      [id, b.chemical_id || null, b.action, b.description || null, b.logged_by || null, b.time || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/chemical-activity/:chemicalId  (all rows for a chemical) ──────
// The client calls .delete().eq('chemical_id', id) → the path segment is the chemical_id.
router.delete('/:chemicalId', async (req, res) => {
  try {
    await pool.query('DELETE FROM chemical_activity WHERE chemical_id = $1', [req.params.chemicalId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
