const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool        = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

const ORDERABLE = new Set(['time', 'action', 'docId', 'id']);

// ── GET /api/iso-document-activity?order_by=time&order_dir=desc&limit=60 ──────
router.get('/', async (req, res) => {
  try {
    const { order_by, order_dir, limit } = req.query;
    let sql = 'SELECT * FROM iso_document_activity';
    const vals = [];

    // "docId" is camelCase → must stay quoted
    const col = ORDERABLE.has(order_by) ? `"${order_by}"` : '"time"';
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

// ── POST /api/iso-document-activity  (append-only audit entry) ───────────────
// Body uses camelCase "docId" and reserved word "user" — both quoted in SQL.
router.post('/', async (req, res) => {
  try {
    const b  = req.body;
    const id = b.id || uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO iso_document_activity (id, action, "docId", description, "user", time)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
       RETURNING *`,
      [id, b.action, b.docId || null, b.description || null, b.user || null, b.time || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
