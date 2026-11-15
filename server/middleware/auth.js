const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const db = require('../database');

const JWT_SECRET = config.jwtSecret;

/**
 * Authentication Middleware:
 * Validates JWT token, verifies user status and verifies token_version against the database.
 * If user was deactivated or session revoked (token_version bumped), rejects request.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user state against database
    const user = db.prepare('SELECT id, username, full_name, role, status, token_version FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User account not found. Please log in again.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact administrator.' });
    }

    // Session revocation check (token_version comparison)
    if (decoded.token_version !== undefined && user.token_version !== decoded.token_version) {
      return res.status(401).json({ error: 'Session has been invalidated or expired. Please log in again.' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      token_version: user.token_version
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

/**
 * Role-Based Access Control (RBAC) Middleware
 * @param {string|string[]} roles - Allowed role or array of allowed roles
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!allowed.includes(req.user.role)) {
        return res.status(403).json({
          error: `Access denied. Requires one of the following roles: ${allowed.join(', ')}.`
        });
      }
      next();
    });
  };
}

const requireAdmin = requireRole(['admin']);
const requireManagerOrAdmin = requireRole(['admin', 'manager']);

/**
 * Generates a signed JWT incorporating the user's current token_version
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      token_version: user.token_version || 1
    },
    JWT_SECRET,
    { expiresIn: config.jwtExpiresIn || '7d' }
  );
}

/**
 * Enterprise Idempotency Middleware:
 * Inspects 'Idempotency-Key' or 'X-Idempotency-Key' header on mutating HTTP requests.
 * Caches successful responses in SQLite to prevent duplicate invoice/payment creation on network retry.
 */
function idempotency(req, res, next) {
  const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  if (!rawKey) {
    return next();
  }

  const key = String(rawKey).trim().slice(0, 128);
  if (!key) {
    return next();
  }

  try {
    // Generate request body payload hash
    const bodyStr = req.body ? JSON.stringify(req.body) : '';
    const reqHash = crypto.createHash('sha256').update(`${req.method}:${req.originalUrl}:${bodyStr}`).digest('hex');

    // Check existing key in database
    const cached = db.prepare('SELECT response_status, response_body, request_hash FROM idempotency_keys WHERE key = ?').get(key);
    if (cached) {
      if (cached.request_hash !== reqHash) {
        return res.status(422).json({
          error: 'Idempotency key reused with different request payload.'
        });
      }

      res.setHeader('X-Cache-Lookup', 'HIT');
      res.setHeader('Content-Type', 'application/json');
      return res.status(cached.response_status).send(cached.response_body);
    }

    // Intercept response to store upon completion
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      res.json = originalJson;
      try {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          const bodySerialized = typeof body === 'string' ? body : JSON.stringify(body);
          db.prepare(`
            INSERT OR REPLACE INTO idempotency_keys (key, request_path, request_hash, response_status, response_body)
            VALUES (?, ?, ?, ?, ?)
          `).run(key, req.originalUrl, reqHash, res.statusCode, bodySerialized);
        }
      } catch (e) {
        console.error('[Idempotency] Failed to cache response:', e.message);
      }
      return originalJson(body);
    };

    next();
  } catch (err) {
    console.error('[Idempotency Error]', err);
    next();
  }
}

module.exports = {
  requireAuth,
  requireRole,
  requireAdmin,
  requireManagerOrAdmin,
  generateToken,
  idempotency,
  JWT_SECRET
};
