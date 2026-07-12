/**
 * api/routes/functions.js
 *
 * Replaces Supabase Edge Functions:
 *   ai-analysis      (actions: risk_and_cei, predict_failure, ocr)
 *   auto-status
 *   send-notifications
 */

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool       = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

// ─── OCR (optional; requires the `tesseract.js` package) ─────────────────────
// Lazily loaded so the API still boots if the package isn't installed.
let _tesseract; // undefined = not tried, null = unavailable
function loadTesseract() {
  if (_tesseract === undefined) {
    try { _tesseract = require('tesseract.js'); }
    catch { _tesseract = null; }
  }
  return _tesseract;
}

/** Map one of our own storage URLs back to the local file, avoiding a network hop. */
function resolveLocalUpload(imageUrl) {
  const marker = '/api/storage/files/';
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return null;
  const rel  = decodeURIComponent(imageUrl.slice(idx + marker.length)); // "lab-documents/<...>"
  const safe = path.normalize(rel).replace(/^([/\\])+/, '');
  if (safe.includes('..')) return null;
  const full = path.join(__dirname, '..', 'uploads', safe);
  return fs.existsSync(full) ? full : null;
}

async function runOcr(imageUrl) {
  const Tesseract = loadTesseract();
  if (!Tesseract) throw new Error('OCR unavailable: tesseract.js is not installed');
  const source = resolveLocalUpload(imageUrl) || imageUrl;
  const opts = {};
  if (process.env.OCR_LANG_PATH) opts.langPath = process.env.OCR_LANG_PATH;
  const { data } = await Tesseract.recognize(source, process.env.OCR_LANG || 'eng', opts);
  return (data.text || '').trim();
}

// ─── Domain helpers ──────────────────────────────────────────────────────────

function daysBetween(dateStr) {
  if (!dateStr) return null;
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

/**
 * CEI Score (0–100) — higher is better compliance
 */
function calcCEI(instrument, logs) {
  let score = 100;
  const maintDays = daysBetween(instrument.next_maintenance);
  const calibDays = daysBetween(instrument.next_calibration);

  // Overdue penalties (up to 30 pts each)
  if (maintDays !== null && maintDays < 0) score -= Math.min(30, Math.abs(maintDays) * 0.5);
  if (calibDays !== null && calibDays < 0) score -= Math.min(30, Math.abs(calibDays) * 0.5);

  // No schedule set
  if (!instrument.next_maintenance) score -= 10;
  if (!instrument.next_calibration) score -= 10;

  // Status penalty
  if (instrument.status === 'out_of_service')  score -= 20;
  else if (instrument.status === 'calibration_due') score -= 10;
  else if (instrument.status === 'maintenance') score -= 5;

  // Recent logs (last 12 months)
  const recentCount = logs.filter((l) => {
    const monthsAgo = (Date.now() - new Date(l.log_date).getTime()) / (30 * 86_400_000);
    return monthsAgo <= 12;
  }).length;
  if (recentCount === 0) score -= 15;
  else if (recentCount < 2) score -= 5;

  // Failed logs
  const failCount = logs.filter((l) => l.status === 'failed').length;
  score -= Math.min(10, failCount * 3);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Risk Score (0–100) — higher is more risky
 */
function calcRisk(instrument, logs) {
  let risk = 0;
  const maintDays = daysBetween(instrument.next_maintenance);
  const calibDays = daysBetween(instrument.next_calibration);

  if (maintDays !== null && maintDays < 0) risk += Math.min(30, Math.abs(maintDays) * 0.8);
  if (calibDays !== null && calibDays < 0) risk += Math.min(30, Math.abs(calibDays) * 0.8);
  if (maintDays !== null && maintDays >= 0 && maintDays <= 7) risk += 10;
  if (calibDays !== null && calibDays >= 0 && calibDays <= 7) risk += 10;
  if (instrument.status === 'out_of_service')   risk += 25;
  else if (instrument.status === 'maintenance') risk += 10;

  const failCount = logs.filter((l) => l.status === 'failed').length;
  risk += Math.min(20, failCount * 5);

  const recentCount = logs.filter((l) => {
    const monthsAgo = (Date.now() - new Date(l.log_date).getTime()) / (30 * 86_400_000);
    return monthsAgo <= 6;
  }).length;
  if (recentCount === 0) risk += 15;

  return Math.max(0, Math.min(100, Math.round(risk)));
}

/**
 * Failure prediction
 */
function predictFailure(instrument, logs) {
  let baseDays    = 180;
  let probability = 0.2;
  let confidence  = 0.4;
  const reasons   = [];

  const maintDays = daysBetween(instrument.next_maintenance);
  const calibDays = daysBetween(instrument.next_calibration);

  if (maintDays !== null && maintDays < 0) {
    const overdue = Math.abs(maintDays);
    baseDays     = Math.max(14, 90 - overdue * 2);
    probability += 0.3;
    reasons.push(`Maintenance overdue by ${overdue} days`);
  }
  if (calibDays !== null && calibDays < 0) {
    const overdue = Math.abs(calibDays);
    baseDays      = Math.min(baseDays, Math.max(14, 90 - overdue * 2));
    probability  += 0.2;
    reasons.push(`Calibration overdue by ${overdue} days`);
  }

  const failCount = logs.filter((l) => l.status === 'failed').length;
  if (failCount > 0) {
    probability += failCount * 0.1;
    baseDays     = Math.max(7, baseDays - failCount * 20);
    confidence  += 0.2;
    reasons.push(`${failCount} failed maintenance log(s)`);
  }

  if (logs.length >= 5)  confidence += 0.2;
  if (logs.length >= 10) confidence += 0.1;

  if (instrument.status === 'out_of_service') {
    baseDays    = 0;
    probability = 1.0;
    confidence  = 0.95;
    reasons.push('Instrument is currently out of service');
  }

  if (reasons.length === 0) {
    reasons.push('No immediate risk factors detected. Instrument appears compliant.');
  }

  return {
    predicted_failure_days: Math.round(baseDays),
    failure_probability:    Math.min(1, parseFloat(probability.toFixed(2))),
    prediction_confidence:  Math.min(1, parseFloat(confidence.toFixed(2))),
    reasoning:              reasons.join('. '),
  };
}

// ── POST /api/functions/ai-analysis ─────────────────────────────────────────
router.post('/ai-analysis', async (req, res) => {
  try {
    let { action, instrument, logs = [], imageUrl, instrument_id } = req.body;

    // OCR needs only an image — handle it before the instrument requirement.
    if (action === 'ocr') {
      if ((process.env.OCR_ENABLED || 'on').toLowerCase() === 'off') {
        return res.json({ text: '' });
      }
      if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required for OCR' });
      try {
        const text = await runOcr(imageUrl);
        return res.json({ text });
      } catch (err) {
        console.error('OCR failed:', err.message);
        return res.json({ text: '', error: err.message });
      }
    }

    // Accept instrument_id as shorthand — fetch instrument + logs from DB
    if (!instrument && instrument_id) {
      const { rows } = await pool.query('SELECT * FROM instruments WHERE id = $1', [instrument_id]);
      if (!rows.length) return res.status(404).json({ error: 'Instrument not found' });
      instrument = rows[0];
      const { rows: logRows } = await pool.query(
        'SELECT * FROM maintenance_logs WHERE instrument_id = $1 ORDER BY log_date DESC',
        [instrument_id],
      );
      logs = logRows;
    }

    if (!instrument) return res.status(400).json({ error: 'instrument or instrument_id is required' });

    if (action === 'risk_and_cei') {
      const cei  = calcCEI(instrument, logs);
      const risk = calcRisk(instrument, logs);

      let recommendation = 'Instrument is in good compliance.';
      if (risk > 70)       recommendation = `High risk detected (${risk}/100). Immediate maintenance action recommended.`;
      else if (risk > 40)  recommendation = `Moderate risk (${risk}/100). Schedule maintenance soon.`;
      else if (cei < 65)   recommendation = `Low compliance score (${cei}/100). Review maintenance and calibration schedule.`;

      await pool.query(
        'UPDATE instruments SET cei_score = $1, risk_score = $2, updated_at = NOW() WHERE id = $3',
        [cei, risk, instrument.id],
      );

      return res.json({ cei_score: cei, risk_score: risk, recommendation });
    }

    if (action === 'predict_failure') {
      const pred = predictFailure(instrument, logs);

      await pool.query(
        `UPDATE instruments SET
           predicted_failure_days = $1,
           failure_probability    = $2,
           prediction_confidence  = $3,
           prediction_reasoning   = $4,
           prediction_updated_at  = NOW(),
           updated_at             = NOW()
         WHERE id = $5`,
        [pred.predicted_failure_days, pred.failure_probability,
         pred.prediction_confidence, pred.reasoning, instrument.id],
      );

      return res.json(pred);
    }

    res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('ai-analysis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/functions/auto-status ─────────────────────────────────────────
router.post('/auto-status', async (req, res) => {
  try {
    const { rows: instruments } = await pool.query(
      'SELECT id, status, next_maintenance, next_calibration FROM instruments',
    );

    let updated = 0;

    for (const inst of instruments) {
      if (inst.status === 'out_of_service') continue; // never auto-change out_of_service

      const maintDays = daysBetween(inst.next_maintenance);
      const calibDays = daysBetween(inst.next_calibration);

      let newStatus = 'operational';

      const calibOverdue = calibDays !== null && calibDays < 0;
      const maintOverdue = maintDays !== null && maintDays < 0;
      const calibSoon    = calibDays !== null && calibDays >= 0 && calibDays <= 7;
      const maintSoon    = maintDays !== null && maintDays >= 0 && maintDays <= 7;

      if (calibOverdue || calibSoon) newStatus = 'calibration_due';
      else if (maintOverdue || maintSoon) newStatus = 'maintenance';

      if (newStatus !== inst.status) {
        await pool.query(
          'UPDATE instruments SET status = $1, updated_at = NOW() WHERE id = $2',
          [newStatus, inst.id],
        );
        updated++;
      }
    }

    res.json({
      updated,
      message: updated === 0 ? 'All statuses up to date' : `${updated} instrument(s) updated`,
    });
  } catch (err) {
    console.error('auto-status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Minimum time that must elapse between digests, per cadence
const CADENCE_MS = {
  daily:  20 * 60 * 60 * 1000,        // ~20h (tolerance for daily run)
  weekly: 6.5 * 24 * 60 * 60 * 1000,  // ~6.5 days
};

/**
 * Core digest routine — shared by the HTTP route and the background scheduler.
 * @param {{ email?: string, force?: boolean }} opts
 * @returns {Promise<{ sent: number, skipped: number }>}
 */
async function runDigest({ email, force } = {}) {
  // Fetch matching notification settings
  let settingsSql = `SELECT * FROM notification_settings WHERE cadence != 'off'`;
  const settingsVals = [];
  if (email) {
    // Still respect cadence='off' unless force=true
    if (force) {
      settingsSql = 'SELECT * FROM notification_settings WHERE email = $1';
    } else {
      settingsSql = `SELECT * FROM notification_settings WHERE email = $1 AND cadence != 'off'`;
    }
    settingsVals.push(email);
  }

  const { rows: settingsList } = await pool.query(settingsSql, settingsVals);
  const { rows: instruments }  = await pool.query('SELECT * FROM instruments');

  let sent    = 0;
  let skipped = 0;
  for (const setting of settingsList) {
    // Respect cadence schedule unless force=true
    if (!force && setting.last_sent_at) {
      const minMs   = CADENCE_MS[setting.cadence] ?? CADENCE_MS.daily;
      const elapsed = Date.now() - new Date(setting.last_sent_at).getTime();
      if (elapsed < minMs) { skipped++; continue; }
    }

    const overdue  = instruments.filter((i) => {
      const md = daysBetween(i.next_maintenance);
      const cd = daysBetween(i.next_calibration);
      return (md !== null && md < 0) || (cd !== null && cd < 0);
    });
    const upcoming = instruments.filter((i) => {
      const w  = setting.upcoming_days || 7;
      const md = daysBetween(i.next_maintenance);
      const cd = daysBetween(i.next_calibration);
      return (md !== null && md >= 0 && md <= w) || (cd !== null && cd >= 0 && cd <= w);
    });

    const parts = [];
    if (setting.alert_overdue  && overdue.length  > 0) parts.push(`${overdue.length} overdue`);
    if (setting.alert_upcoming && upcoming.length > 0) parts.push(`${upcoming.length} upcoming`);

    const subject = `LabCEI Digest: ${parts.join(', ') || 'All systems nominal'}`;
    const summary = parts.length > 0 ? `Alerts: ${parts.join(', ')}` : 'No active alerts.';

    await pool.query(
      `INSERT INTO notifications_log (id,email,subject,summary,delivery_status)
       VALUES ($1,$2,$3,$4,'sent')`,
      [uuidv4(), setting.email, subject, summary],
    );
    await pool.query(
      `UPDATE notification_settings SET last_sent_at = NOW() WHERE email = $1`,
      [setting.email],
    );
    sent++;
  }

  return { sent, skipped };
}

// ── POST /api/functions/send-notifications ───────────────────────────────────
router.post('/send-notifications', async (req, res) => {
  try {
    const { email, force } = req.body;
    const { sent, skipped } = await runDigest({ email, force });
    res.json({ sent, skipped, message: `Notifications sent to ${sent} user(s), ${skipped} skipped (cadence)` });
  } catch (err) {
    console.error('send-notifications error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.runDigest = runDigest;
