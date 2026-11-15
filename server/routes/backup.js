const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

const backupsDir = path.join(__dirname, '..', '..', 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

const upload = multer({
  dest: backupsDir,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// List all backups
router.get('/', requireAdmin, (req, res) => {
  const backups = db.prepare('SELECT * FROM backups ORDER BY id DESC').all();
  const formatted = backups.map(b => ({
    ...b,
    size: b.filesize ? `${(b.filesize / 1024).toFixed(1)} KB` : 'N/A'
  }));
  res.json(formatted);
});

router.get('/list', requireAdmin, (req, res) => {
  const backups = db.prepare('SELECT * FROM backups ORDER BY id DESC').all();
  const formatted = backups.map(b => ({
    ...b,
    size: b.filesize ? `${(b.filesize / 1024).toFixed(1)} KB` : 'N/A'
  }));
  res.json(formatted);
});

// Create manual backup
router.post('/create', requireAdmin, (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `textile_backup_${timestamp}.db`;
    const targetPath = path.join(backupsDir, filename);

    // SQLite backup API
    db.backup(targetPath)
      .then(() => {
        const stats = fs.statSync(targetPath);
        const result = db.prepare(`
          INSERT INTO backups (filename, filesize, backup_type, created_by)
          VALUES (?, ?, 'manual', ?)
        `).run(filename, stats.size, req.user.full_name);

        logAudit(req.user.id, req.user.full_name, 'BACKUP_CREATE', 'backups', result.lastInsertRowid, `Created database backup: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);

        res.json({
          message: 'Database backup created successfully',
          id: result.lastInsertRowid,
          filename,
          filesize: stats.size
        });
      })
      .catch(err => {
        console.error('Backup failed:', err);
        res.status(500).json({ error: 'Database backup operation failed: ' + err.message });
      });
  } catch (err) {
    res.status(500).json({ error: 'Failed to initiate backup: ' + err.message });
  }
});

// Download backup file
router.get('/download/:filename', requireAdmin, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(backupsDir, path.basename(filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }

  logAudit(req.user.id, req.user.full_name, 'BACKUP_DOWNLOAD', 'backups', null, `Downloaded backup file ${filename}`);
  res.download(filePath, filename);
});

// Restore backup from uploaded file
router.post('/restore', requireAdmin, upload.single('backup_file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No backup file uploaded' });
  }

  try {
    const uploadedPath = req.file.path;
    const dbPath = path.join(__dirname, '..', '..', 'textile_billing.db');

    // First take a safety snapshot of current DB before restoring
    const safetySnapshot = path.join(backupsDir, `pre_restore_safety_${Date.now()}.db`);
    fs.copyFileSync(dbPath, safetySnapshot);

    // Copy uploaded file to main DB location
    // Note: In SQLite WAL mode, close or force checkpoint before overwrite
    db.pragma('wal_checkpoint(TRUNCATE)');

    fs.copyFileSync(uploadedPath, dbPath);
    fs.unlinkSync(uploadedPath); // remove temp

    logAudit(req.user.id, req.user.full_name, 'BACKUP_RESTORE', 'database', 1, 'Restored database from uploaded backup file');

    res.json({
      message: 'Database restored successfully! Please reload the page to refresh all active data.',
      safety_snapshot: path.basename(safetySnapshot)
    });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Failed to restore database: ' + err.message });
  }
});

// Restore from existing backup file on server
router.post('/restore-existing/:filename', requireAdmin, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(backupsDir, path.basename(filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup file not found on server' });
  }

  try {
    const dbPath = path.join(__dirname, '..', '..', 'textile_billing.db');

    // Pre-restore safety snapshot
    const safetySnapshot = path.join(backupsDir, `pre_restore_safety_${Date.now()}.db`);
    fs.copyFileSync(dbPath, safetySnapshot);

    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(filePath, dbPath);

    logAudit(req.user.id, req.user.full_name, 'BACKUP_RESTORE', 'database', 1, `Restored database from ${filename}`);

    res.json({
      message: `Database restored successfully from ${filename}! Please reload the application.`,
      safety_snapshot: path.basename(safetySnapshot)
    });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Failed to restore database: ' + err.message });
  }
});

// Delete backup file
router.delete('/:filename', requireAdmin, (req, res) => {
  const { filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(backupsDir, safeFilename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  db.prepare('DELETE FROM backups WHERE filename = ?').run(safeFilename);
  logAudit(req.user.id, req.user.full_name, 'BACKUP_DELETE', 'backups', null, `Deleted backup file ${safeFilename}`);

  res.json({ message: 'Backup file deleted successfully' });
});

module.exports = router;

