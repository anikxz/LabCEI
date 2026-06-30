const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const path       = require('path');
const fs         = require('fs');
const pool       = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

function requireTechnician(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'technician') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
}

// ── GET /api/documents?instrument_id=... ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { instrument_id } = req.query;
    let sql    = 'SELECT * FROM documents';
    const vals = [];

    if (instrument_id) {
      sql += ' WHERE instrument_id = $1';
      vals.push(instrument_id);
    }
    sql += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(sql, vals);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/documents ──────────────────────────────────────────────────────
router.post('/', requireTechnician, async (req, res) => {
  try {
    const { instrument_id, log_id, file_name, file_path: filePath, file_type, ocr_text } = req.body;
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO documents (id,instrument_id,log_id,file_name,file_path,file_type,ocr_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [id, instrument_id, log_id || null, file_name, filePath, file_type || null, ocr_text || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/documents/:id ────────────────────────────────────────────────
router.delete('/:id', requireTechnician, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT file_path FROM documents WHERE id = $1', [req.params.id]);
    if (rows.length > 0) {
      const normalized = path.normalize(rows[0].file_path).replace(/^[\/\\]+/, '');
      const fullPath   = path.join(__dirname, '..', 'uploads', 'lab-documents', normalized);
      fs.unlink(fullPath, () => {}); // best-effort cleanup, ignore errors
    }
    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
