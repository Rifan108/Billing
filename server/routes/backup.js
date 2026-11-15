const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../database');
const config = require('../config');
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

/**
 * Calculates SHA-256 checksum of a file
 */
function calculateFileChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

/**
 * Validates SQLite binary format header ("SQLite format 3\0")
 */
function isValidSqliteFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);
    const magic = buffer.toString('utf8', 0, 15);
    return magic === 'SQLite format 3';
  } catch (err) {
    return false;
  }
}

/**
 * Retention policy: Prunes backups older than configured days (default 14 days)
 */
function pruneOldBackups() {
  try {
    const retentionDays = config.backupRetentionDays || 14;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const oldBackups = db.prepare(`
      SELECT id, filename FROM backups
      WHERE created_at < ? AND backup_type != 'pre_restore_safety'
    `).all(cutoffDate);

    for (const b of oldBackups) {
      const filePath = path.join(backupsDir, path.basename(b.filename));
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
      db.prepare('DELETE FROM backups WHERE id = ?').run(b.id);
      console.log(`[Backup Retention] Pruned expired backup: ${b.filename}`);
    }
  } catch (err) {
    console.error('[Backup Retention] Error during pruning:', err.message);
  }
}

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

// Create manual backup with SHA-256 checksum
router.post('/create', requireAdmin, (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `textile_backup_${timestamp}.db`;
    const targetPath = path.join(backupsDir, filename);

    db.backup(targetPath)
      .then(async () => {
        const stats = fs.statSync(targetPath);
        const checksum = await calculateFileChecksum(targetPath);

        const result = db.prepare(`
          INSERT INTO backups (filename, filesize, backup_type, created_by, checksum)
          VALUES (?, ?, 'manual', ?, ?)
        `).run(filename, stats.size, req.user.full_name, checksum);

        logAudit(req.user.id, req.user.full_name, 'BACKUP_CREATE', 'backups', result.lastInsertRowid, `Created database backup: ${filename} (${(stats.size / 1024).toFixed(1)} KB, SHA256: ${checksum.slice(0, 12)}...)`);

        res.json({
          message: 'Database backup created successfully',
          id: result.lastInsertRowid,
          filename,
          filesize: stats.size,
          checksum
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

// Restore backup from uploaded file with integrity validation
router.post('/restore', requireAdmin, upload.single('backup_file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No backup file uploaded' });
  }

  const uploadedPath = req.file.path;
  try {
    // Validate SQLite format header
    if (!isValidSqliteFile(uploadedPath)) {
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      return res.status(400).json({ error: 'Uploaded file is corrupted or not a valid SQLite database.' });
    }

    const dbPath = path.join(__dirname, '..', '..', 'textile_billing.db');

    // Pre-restore safety snapshot
    const safetySnapshotFilename = `pre_restore_safety_${Date.now()}.db`;
    const safetySnapshot = path.join(backupsDir, safetySnapshotFilename);
    fs.copyFileSync(dbPath, safetySnapshot);

    const safetyStats = fs.statSync(safetySnapshot);
    const safetyChecksum = await calculateFileChecksum(safetySnapshot);
    db.prepare(`
      INSERT INTO backups (filename, filesize, backup_type, created_by, checksum)
      VALUES (?, ?, 'pre_restore_safety', 'System Pre-Restore Guard', ?)
    `).run(safetySnapshotFilename, safetyStats.size, safetyChecksum);

    // Overwrite database
    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(uploadedPath, dbPath);
    fs.unlinkSync(uploadedPath);

    logAudit(req.user.id, req.user.full_name, 'BACKUP_RESTORE', 'database', 1, 'Restored database from uploaded backup file');

    res.json({
      message: 'Database restored successfully! Application data has been refreshed.',
      safety_snapshot: safetySnapshotFilename
    });
  } catch (err) {
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Failed to restore database: ' + err.message });
  }
});

// Restore from existing backup file on server
router.post('/restore-existing/:filename', requireAdmin, async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(backupsDir, path.basename(filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup file not found on server' });
  }

  try {
    if (!isValidSqliteFile(filePath)) {
      return res.status(400).json({ error: 'Target backup file is corrupted or not a valid SQLite database.' });
    }

    const dbPath = path.join(__dirname, '..', '..', 'textile_billing.db');

    // Pre-restore safety snapshot
    const safetySnapshotFilename = `pre_restore_safety_${Date.now()}.db`;
    const safetySnapshot = path.join(backupsDir, safetySnapshotFilename);
    fs.copyFileSync(dbPath, safetySnapshot);

    const safetyStats = fs.statSync(safetySnapshot);
    const safetyChecksum = await calculateFileChecksum(safetySnapshot);
    db.prepare(`
      INSERT INTO backups (filename, filesize, backup_type, created_by, checksum)
      VALUES (?, ?, 'pre_restore_safety', 'System Pre-Restore Guard', ?)
    `).run(safetySnapshotFilename, safetyStats.size, safetyChecksum);

    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(filePath, dbPath);

    logAudit(req.user.id, req.user.full_name, 'BACKUP_RESTORE', 'database', 1, `Restored database from ${filename}`);

    res.json({
      message: `Database restored successfully from ${filename}!`,
      safety_snapshot: safetySnapshotFilename
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
module.exports.pruneOldBackups = pruneOldBackups;
module.exports.calculateFileChecksum = calculateFileChecksum;
