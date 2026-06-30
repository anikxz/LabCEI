const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const requireAuth = require('../middleware/auth');

function requireTechnician(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'technician') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
}

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Only these bucket names may be used — prevents path traversal via :bucket
const ALLOWED_BUCKETS = new Set(['lab-documents']);

// Use memory storage — we write manually to preserve subdirectory structure
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    const allowed = new Set([
      'image/jpeg','image/png','image/gif','image/webp',
      'application/pdf','application/octet-stream',
    ]);
    cb(null, allowed.has(file.mimetype) || file.mimetype.startsWith('image/'));
  },
});

// ── POST /api/storage/upload/:bucket ────────────────────────────────────────
// Form fields: file (binary), path (string — e.g. "instrumentId/ts-uuid.pdf")
router.post('/upload/:bucket', requireAuth, requireTechnician, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const bucket        = req.params.bucket;
  if (!ALLOWED_BUCKETS.has(bucket)) return res.status(400).json({ error: 'Invalid bucket' });
  const requestedPath = req.body.path;
  if (!requestedPath) return res.status(400).json({ error: 'path field is required in form data' });

  // Sanitise: no path traversal
  const normalised = path.posix.normalize(requestedPath).replace(/^[\/\\]+/, '');
  if (normalised.includes('..')) return res.status(400).json({ error: 'Invalid path' });

  const destDir  = path.join(UPLOADS_DIR, bucket, path.dirname(normalised));
  const destFile = path.join(UPLOADS_DIR, bucket, normalised);

  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(destFile, req.file.buffer);
  } catch (err) {
    return res.status(500).json({ error: `File write failed: ${err.message}` });
  }

  const base      = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
  const publicUrl = `${base}/api/storage/files/${bucket}/${normalised}`;

  res.json({ path: normalised, publicUrl });
});

// ── GET /api/storage/files/:bucket/* ────────────────────────────────────────
router.get('/files/:bucket/*', (req, res) => {
  const bucket    = req.params.bucket;
  if (!ALLOWED_BUCKETS.has(bucket)) return res.status(404).json({ error: 'File not found' });
  const filePath  = req.params[0]; // everything after /files/:bucket/

  const normalised = path.normalize(filePath).replace(/^[\/\\]+/, '');
  if (normalised.includes('..')) return res.status(403).json({ error: 'Forbidden' });

  const fullPath = path.join(UPLOADS_DIR, bucket, normalised);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

  res.sendFile(fullPath);
});

// ── DELETE /api/storage/files/:bucket/* ─────────────────────────────────────
router.delete('/files/:bucket/*', requireAuth, requireTechnician, (req, res) => {
  const bucket = req.params.bucket;
  if (!ALLOWED_BUCKETS.has(bucket)) return res.status(404).json({ error: 'File not found' });

  const normalised = path.normalize(req.params[0]).replace(/^[\/\\]+/, '');
  if (normalised.includes('..')) return res.status(403).json({ error: 'Forbidden' });

  const fullPath = path.join(UPLOADS_DIR, bucket, normalised);
  fs.unlink(fullPath, () => {}); // best-effort
  res.status(204).send();
});

module.exports = router;
