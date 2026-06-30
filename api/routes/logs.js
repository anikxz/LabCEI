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

// ── GET /api/maintenance-logs ────────────────────────────────────────────────
// Query params:
//   instrument_id        – filter by instrument
//   include_instrument   – join instruments table (returns nested { instruments: { name } })
//   order_by / order_dir – sort
//   limit                – cap results
router.get('/', async (req, res) => {
  try {
    const {
      instrument_id,
      include_instrument,
      limit,
      order_by  = 'log_date',
      order_dir = 'desc',
    } = req.query;

    const ALLOWED = new Set(['log_date', 'created_at', 'cost']);
    const col = ALLOWED.has(order_by) ? order_by : 'log_date';
    const dir = order_dir === 'asc' ? 'ASC' : 'DESC';

    const conditions = [];
    const values     = [];
    let   p          = 1;

    if (instrument_id) {
      conditions.push(`ml.instrument_id = $${p++}`);
      values.push(instrument_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    let limitClause = '';
    if (limit) {
      limitClause = `LIMIT $${p++}`;
      values.push(parseInt(limit, 10));
    }

    let sql;
    if (include_instrument === 'true' || include_instrument === '1') {
      // Matches Supabase's  .select('*, instruments(name)')  pattern
      sql = `
        SELECT ml.*,
               json_build_object('name', i.name) AS instruments
        FROM   maintenance_logs ml
        LEFT   JOIN instruments i ON i.id = ml.instrument_id
        ${where}
        ORDER  BY ml.${col} ${dir}
        ${limitClause}
      `;
    } else {
      sql = `
        SELECT * FROM maintenance_logs ml
        ${where}
        ORDER BY ${col} ${dir}
        ${limitClause}
      `;
    }

    const { rows } = await pool.query(sql, values);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/maintenance-logs ───────────────────────────────────────────────
router.post('/', requireTechnician, async (req, res) => {
  try {
    const d  = req.body;
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO maintenance_logs
         (id,instrument_id,log_type,description,technician,
          log_date,next_due_date,cost,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        id,
        d.instrument_id,
        d.log_type      || 'maintenance',
        d.description   || null,
        d.technician    || null,
        d.log_date,
        d.next_due_date || null,
        d.cost          || null,
        d.status        || 'completed',
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/maintenance-logs/:id ────────────────────────────────────────
router.delete('/:id', requireTechnician, async (req, res) => {
  try {
    await pool.query('DELETE FROM maintenance_logs WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
