const express = require('express');
const router  = express.Router();
const pool       = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// ── GET /api/notifications-log?email=...&limit=... ───────────────────────────
router.get('/', async (req, res) => {
  try {
    const { email, limit = '10' } = req.query;
    const conditions = [];
    const values     = [];
    let   p          = 1;

    if (email) {
      conditions.push(`email = $${p++}`);
      values.push(email);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(parseInt(limit, 10));

    const { rows } = await pool.query(
      `SELECT * FROM notifications_log ${where} ORDER BY sent_at DESC LIMIT $${p}`,
      values,
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
