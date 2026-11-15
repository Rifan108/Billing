const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Ensure DB is initialized
const db = require('./database');

// Automated Daily Database Backup
const backupsDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

function runDailyAutoBackup() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const existing = db.prepare(`SELECT id FROM backups WHERE filename LIKE ?`).get(`%${todayStr}%`);
    if (!existing) {
      const filename = `textile_auto_backup_${todayStr}.db`;
      const targetPath = path.join(backupsDir, filename);
      db.backup(targetPath).then(() => {
        const stats = fs.statSync(targetPath);
        db.prepare(`
          INSERT INTO backups (filename, filesize, backup_type, created_by)
          VALUES (?, ?, 'daily_auto', 'System Scheduler')
        `).run(filename, stats.size);
        console.log(`[AutoBackup] Completed daily snapshot: ${filename}`);
      }).catch(err => console.error('[AutoBackup] Backup failed:', err));
    }
  } catch (err) {
    console.error('[AutoBackup] Error:', err);
  }
}
setTimeout(runDailyAutoBackup, 5000);
setInterval(runDailyAutoBackup, 24 * 60 * 60 * 1000);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/gst', require('./routes/gst'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/returns', require('./routes/returns'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/audit', require('./routes/audit'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Textile Shop Billing & Management Software',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(clientDist, 'index.html'));
    }
    next();
  });
}

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'An internal server error occurred' });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Textiles Billing Engine active on http://localhost:${PORT}`);
  console.log(` API available at http://localhost:${PORT}/api`);
  console.log(`=======================================================`);
});
