const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool       = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

function requireTechnician(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'technician') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
}

const ALLOWED_ORDER_COLS = new Set(['name','created_at','updated_at','status','cei_score','next_maintenance','next_calibration']);
const MUTABLE_FIELDS = [
  'name','model','serial_number','location','category','status',
  'purchase_date','last_maintenance','next_maintenance',
  'last_calibration','next_calibration','notes',
  'cei_score','risk_score',
  'predicted_failure_days','failure_probability',
  'prediction_confidence','prediction_reasoning','prediction_updated_at',
];

// ── GET /api/instruments ─────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const orderBy = ALLOWED_ORDER_COLS.has(req.query.order_by) ? req.query.order_by : 'created_at';
    const dir     = req.query.order_dir === 'asc' ? 'ASC' : 'DESC';
    const { rows } = await pool.query(
      `SELECT * FROM instruments ORDER BY ${orderBy} ${dir}`,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/instruments/:id ─────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM instruments WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/instruments ────────────────────────────────────────────────────
router.post('/', requireTechnician, async (req, res) => {
  try {
    const d  = req.body;
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO instruments
         (id,name,model,serial_number,location,category,status,
          purchase_date,last_maintenance,next_maintenance,
          last_calibration,next_calibration,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        id,
        d.name,
        d.model            || null,
        d.serial_number    || null,
        d.location         || null,
        d.category         || null,
        d.status           || 'operational',
        d.purchase_date    || null,
        d.last_maintenance || null,
        d.next_maintenance || null,
        d.last_calibration || null,
        d.next_calibration || null,
        d.notes            || null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/instruments/:id ─────────────────────────────────────────────────
router.put('/:id', requireTechnician, async (req, res) => {
  try {
    const data    = req.body;
    const sets    = [];
    const values  = [];
    let   p       = 1;

    for (const field of MUTABLE_FIELDS) {
      if (field in data) {
        sets.push(`${field} = $${p++}`);
        // Empty string → NULL (allows clearing date fields)
        values.push(data[field] === '' ? null : data[field]);
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE instruments SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${p} RETURNING *`,
      values,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/instruments/:id ──────────────────────────────────────────────
router.delete('/:id', requireTechnician, async (req, res) => {
  try {
    await pool.query('DELETE FROM instruments WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
