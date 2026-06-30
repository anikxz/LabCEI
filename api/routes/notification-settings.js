const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool       = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

const MUTABLE = [
  'full_name','role','cadence',
  'alert_overdue','alert_upcoming','alert_out_of_service','alert_low_cei',
  'upcoming_days',
  'alert_chem_low_stock','alert_chem_out_of_stock','alert_chem_expiring','expiring_days',
];

// ── GET /api/notification-settings?email=... ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;
    if (email) {
      const { rows } = await pool.query(
        'SELECT * FROM notification_settings WHERE email = $1 LIMIT 1',
        [email],
      );
      return res.json(rows[0] || null);
    }
    // No email param → return current user's row
    const { rows } = await pool.query(
      'SELECT * FROM notification_settings WHERE email = $1 LIMIT 1',
      [req.user.email],
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/notification-settings  (insert OR upsert by email) ─────────────
// Called with ?onConflict=email for upsert behaviour
router.post('/', async (req, res) => {
  try {
    const d  = req.body;
    const id = d.id || uuidv4();

    const { rows } = await pool.query(
      `INSERT INTO notification_settings
         (id,email,full_name,role,cadence,
          alert_overdue,alert_upcoming,alert_out_of_service,alert_low_cei,upcoming_days,
          alert_chem_low_stock,alert_chem_out_of_stock,alert_chem_expiring,expiring_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (email) DO UPDATE SET
         full_name               = EXCLUDED.full_name,
         role                    = EXCLUDED.role,
         cadence                 = EXCLUDED.cadence,
         alert_overdue           = EXCLUDED.alert_overdue,
         alert_upcoming          = EXCLUDED.alert_upcoming,
         alert_out_of_service    = EXCLUDED.alert_out_of_service,
         alert_low_cei           = EXCLUDED.alert_low_cei,
         upcoming_days           = EXCLUDED.upcoming_days,
         alert_chem_low_stock    = EXCLUDED.alert_chem_low_stock,
         alert_chem_out_of_stock = EXCLUDED.alert_chem_out_of_stock,
         alert_chem_expiring     = EXCLUDED.alert_chem_expiring,
         expiring_days           = EXCLUDED.expiring_days,
         updated_at              = NOW()
       RETURNING *`,
      [
        id,
        d.email,
        d.full_name                || null,
        d.role                     || 'viewer',
        d.cadence                  || 'daily',
        d.alert_overdue            ?? true,
        d.alert_upcoming           ?? true,
        d.alert_out_of_service     ?? true,
        d.alert_low_cei            ?? false,
        d.upcoming_days            || 7,
        d.alert_chem_low_stock     ?? true,
        d.alert_chem_out_of_stock  ?? true,
        d.alert_chem_expiring      ?? true,
        d.expiring_days            || 30,
      ],
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/notification-settings/:identifier ───────────────────────────────
// :identifier can be a UUID (id) or email address
router.put('/:identifier', async (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.identifier);
    const filterCol  = identifier.includes('@') ? 'email' : 'id';

    const data = req.body;
    const sets   = [];
    const values = [];
    let   p      = 1;

    for (const key of MUTABLE) {
      if (key in data) {
        sets.push(`${key} = $${p++}`);
        values.push(data[key]);
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    values.push(identifier);
    const { rows } = await pool.query(
      `UPDATE notification_settings
       SET ${sets.join(', ')}, updated_at = NOW()
       WHERE ${filterCol} = $${p}
       RETURNING *`,
      values,
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
