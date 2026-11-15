const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Ensure DB is initialized
const db = require('./database');
const { pruneOldBackups, calculateFileChecksum } = require('./routes/backup');

// Automated Daily Database Backup with SHA-256 Checksum & 14-day Retention Pruning
const backupsDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

function runDailyAutoBackup() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const existing = db.prepare(`SELECT id FROM backups WHERE filename LIKE ?`).get(`%${todayStr}%`);
    if (!existing) {
      const filename = `textile_auto_backup_${todayStr}.db`;
      const targetPath = path.join(backupsDir, filename);
      db.backup(targetPath).then(async () => {
        const stats = fs.statSync(targetPath);
        const checksum = await calculateFileChecksum(targetPath);
        db.prepare(`
          INSERT INTO backups (filename, filesize, backup_type, created_by, checksum)
          VALUES (?, ?, 'daily_auto', 'System Scheduler', ?)
        `).run(filename, stats.size, checksum);
        console.log(`[AutoBackup] Completed daily snapshot: ${filename} (SHA256: ${checksum.slice(0, 12)}...)`);
        
        // Execute automated retention pruning
        pruneOldBackups();
      }).catch(err => console.error('[AutoBackup] Backup failed:', err));
    } else {
      // Still prune old backups periodically
      pruneOldBackups();
    }
  } catch (err) {
    console.error('[AutoBackup] Error:', err.message);
  }
}
setTimeout(runDailyAutoBackup, 5000);
setInterval(runDailyAutoBackup, 24 * 60 * 60 * 1000);

const app = express();
const PORT = config.port || 5000;

// Security: Disable X-Powered-By
app.disable('x-powered-by');

// Security Headers Middleware (Helmet equivalent)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: http: https:; connect-src 'self' http: https:; frame-ancestors 'self';"
  );
  if (config.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// CORS Lockdown
const allowedOrigins = config.allowedOrigins;
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests or allowed origins
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy violation: origin ${origin} is not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Idempotency-Key'],
  credentials: true
}));

// Body Parsing Limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// In-Memory Rate Limiting
const rateLimitMap = new Map();
function createRateLimiter(windowMs, maxRequests, message) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const now = Date.now();
    let record = rateLimitMap.get(ip);

    if (!record || now - record.startTime > windowMs) {
      record = { startTime: now, count: 1 };
      rateLimitMap.set(ip, record);
    } else {
      record.count += 1;
    }

    if (record.count > maxRequests) {
      return res.status(429).json({ error: message || 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Global API Rate Limiter
app.use('/api', createRateLimiter(
  config.rateLimit.windowMs,
  config.rateLimit.maxRequests,
  'Too many API requests from this IP. Please try again later.'
));

// Serve static uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Textile Shop Billing & Management Software',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

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

// Global error handler (Sanitizes errors to prevent leaking internal stack traces)
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]', err.message || err);
  const statusCode = err.status || 500;
  const isProd = config.nodeEnv === 'production';
  res.status(statusCode).json({
    error: isProd && statusCode === 500 ? 'An internal server error occurred' : (err.message || 'An internal server error occurred')
  });
});

// Crash Prevention: Global Process Error Handlers
process.on('uncaughtException', (err) => {
  console.error('[CRASH PREVENTED - Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH PREVENTED - Unhandled Rejection]:', reason);
});

// Graceful Shutdown
function handleShutdown(signal) {
  console.log(`[Server] Received ${signal}. Executing graceful shutdown...`);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('[Database] WAL checkpoint completed.');
  } catch (e) {
    console.error('[Database] Checkpoint error:', e.message);
  }
  process.exit(0);
}
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Textiles Billing Engine active on http://localhost:${PORT}`);
  console.log(` API available at http://localhost:${PORT}/api`);
  console.log(` Environment: ${config.nodeEnv}`);
  console.log(`=======================================================`);
});

module.exports = app;
