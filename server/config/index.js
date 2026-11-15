require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'e8f4c2b9a7d3615e9821f00a4b3d8e7c1059f8e432a1b7c8d9e0f1a2b3c4d5e6',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(o => o.trim()),
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 mins
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000,
    loginMaxAttempts: parseInt(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS, 10) || 5
  },
  dbFilename: process.env.DB_FILENAME || 'textile_billing.db',
  backupRetentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 14
};

module.exports = config;
