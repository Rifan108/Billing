const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { requireAuth, requireAdmin, generateToken } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

const VALID_ROLES = ['admin', 'manager', 'cashier', 'staff'];
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Validates password strength policy:
 * - At least 8 characters
 * - At least one letter and one number
 */
function validatePasswordPolicy(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one letter and one number' };
  }
  return { valid: true };
}

// Record login attempt in login_history table
function recordLoginHistory(userId, username, ip, userAgent, status, failureReason = null) {
  try {
    db.prepare(`
      INSERT INTO login_history (user_id, username, ip_address, user_agent, status, failure_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId || null, username, ip || null, userAgent ? userAgent.slice(0, 255) : null, status, failureReason);
  } catch (err) {
    console.error('[LoginHistory] Error logging attempt:', err.message);
  }
}

// User Login with Rate Limiting & Lockout
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUsername);

  // Check account existence
  if (!user) {
    recordLoginHistory(null, cleanUsername, ip, userAgent, 'failed', 'User not found');
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Check if account is inactive
  if (user.status !== 'active') {
    recordLoginHistory(user.id, cleanUsername, ip, userAgent, 'failed', 'Account inactive');
    return res.status(403).json({ error: 'Account has been disabled. Please contact your administrator.' });
  }

  // Check account lockout
  if (user.lockout_until) {
    const lockoutDate = new Date(user.lockout_until);
    const now = new Date();
    if (lockoutDate > now) {
      const remainingMinutes = Math.ceil((lockoutDate.getTime() - now.getTime()) / (60 * 1000));
      recordLoginHistory(user.id, cleanUsername, ip, userAgent, 'locked', `Account locked for ${remainingMinutes}m`);
      return res.status(429).json({
        error: `Account temporarily locked due to consecutive failed attempts. Please try again after ${remainingMinutes} minute(s).`
      });
    } else {
      // Lockout expired, reset attempts
      db.prepare('UPDATE users SET lockout_until = NULL, failed_login_attempts = 0 WHERE id = ?').run(user.id);
      user.failed_login_attempts = 0;
      user.lockout_until = null;
    }
  }

  // Validate password
  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    const newFailedCount = (user.failed_login_attempts || 0) + 1;
    let lockoutTime = null;

    if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
      lockoutTime = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE users
        SET failed_login_attempts = ?, lockout_until = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newFailedCount, lockoutTime, user.id);

      recordLoginHistory(user.id, cleanUsername, ip, userAgent, 'locked', `Locked after ${newFailedCount} failed attempts`);
      return res.status(429).json({
        error: `Account locked due to 5 consecutive failed login attempts. Please try again in ${LOCKOUT_MINUTES} minutes.`
      });
    }

    db.prepare(`
      UPDATE users
      SET failed_login_attempts = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newFailedCount, user.id);

    recordLoginHistory(user.id, cleanUsername, ip, userAgent, 'failed', `Invalid password (attempt ${newFailedCount}/${MAX_FAILED_ATTEMPTS})`);
    return res.status(401).json({
      error: `Invalid username or password. Remaining attempts: ${Math.max(0, MAX_FAILED_ATTEMPTS - newFailedCount)}`
    });
  }

  // Login successful: reset failed attempts, update last login metadata
  db.prepare(`
    UPDATE users
    SET failed_login_attempts = 0,
        lockout_until = NULL,
        last_login_at = CURRENT_TIMESTAMP,
        last_login_ip = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(ip, user.id);

  recordLoginHistory(user.id, cleanUsername, ip, userAgent, 'success');
  logAudit(user.id, user.full_name, 'LOGIN', 'users', user.id, 'User logged in successfully', ip);

  const token = generateToken(user);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      phone: user.phone
    }
  });
});

// Current user profile
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, username, full_name, role, phone, status, last_login_at, last_login_ip, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// List all users (admin only)
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, full_name, role, phone, status, last_login_at, created_at, updated_at
    FROM users ORDER BY id ASC
  `).all();
  res.json(users);
});

// Create user (admin only)
router.post('/users', requireAdmin, (req, res) => {
  const { username, password, full_name, role, phone } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Username, password, full name, and role are required' });
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Allowed roles are: ${VALID_ROLES.join(', ')}` });
  }

  const pwCheck = validatePasswordPolicy(password);
  if (!pwCheck.valid) {
    return res.status(400).json({ error: pwCheck.error });
  }

  const cleanUsername = username.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
  if (existing) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, phone, status, token_version)
    VALUES (?, ?, ?, ?, ?, 'active', 1)
  `).run(cleanUsername, hash, full_name.trim(), role, phone ? phone.trim() : null);

  logAudit(req.user.id, req.user.full_name, 'USER_CREATE', 'users', result.lastInsertRowid, `Created user ${cleanUsername} with role ${role}`);

  res.status(201).json({
    id: result.lastInsertRowid,
    username: cleanUsername,
    full_name: full_name.trim(),
    role,
    phone
  });
});

// Update user (admin only)
router.put('/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { full_name, role, phone, status, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Prevent demoting or deactivating the last active admin
  if (user.role === 'admin' && (role !== 'admin' || status === 'inactive')) {
    const adminCount = db.prepare("SELECT count(*) as count FROM users WHERE role = 'admin' AND status = 'active'").get().count;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot deactivate or change the role of the last active administrator.' });
    }
  }

  if (role && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Allowed roles: ${VALID_ROLES.join(', ')}` });
  }

  let hash = user.password_hash;
  let tokenVersion = user.token_version || 1;

  if (password && password.trim().length > 0) {
    const pwCheck = validatePasswordPolicy(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.error });
    }
    hash = bcrypt.hashSync(password, 10);
    // Invalidate prior sessions if admin resets password
    tokenVersion += 1;
  }

  // If status changed to inactive, revoke sessions
  if (status === 'inactive') {
    tokenVersion += 1;
  }

  db.prepare(`
    UPDATE users
    SET full_name = ?, role = ?, phone = ?, status = ?, password_hash = ?, token_version = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    full_name ? full_name.trim() : user.full_name,
    role || user.role,
    phone !== undefined ? phone : user.phone,
    status || user.status,
    hash,
    tokenVersion,
    id
  );

  logAudit(req.user.id, req.user.full_name, 'USER_UPDATE', 'users', id, `Updated user ${user.username}`);

  res.json({ message: 'User updated successfully' });
});

// Session Revocation (admin only)
router.post('/revoke-sessions/:userId', requireAdmin, (req, res) => {
  const { userId } = req.params;
  const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare(`
    UPDATE users
    SET token_version = COALESCE(token_version, 1) + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);

  logAudit(req.user.id, req.user.full_name, 'SESSION_REVOCATION', 'users', userId, `Revoked all active sessions for ${targetUser.username}`);

  res.json({ message: `All active sessions for user '${targetUser.username}' have been invalidated.` });
});

// Change password for logged in user (supports both PUT and POST)
const handleChangePassword = (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  const pwCheck = validatePasswordPolicy(newPassword);
  if (!pwCheck.valid) {
    return res.status(400).json({ error: pwCheck.error });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Incorrect current password' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  const nextTokenVersion = (user.token_version || 1) + 1;

  db.prepare(`
    UPDATE users
    SET password_hash = ?,
        token_version = ?,
        password_changed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newHash, nextTokenVersion, req.user.id);

  logAudit(req.user.id, req.user.full_name, 'PASSWORD_CHANGE', 'users', req.user.id, 'User changed own password');

  // Issue new token with updated token_version so current session stays alive
  const updatedUser = { ...user, token_version: nextTokenVersion };
  const newToken = generateToken(updatedUser);

  res.json({
    message: 'Password changed successfully. Other active sessions have been revoked.',
    token: newToken
  });
};

router.put('/change-password', requireAuth, handleChangePassword);
router.post('/change-password', requireAuth, handleChangePassword);

// Get Login History (admin only)
router.get('/login-history', requireAdmin, (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const history = db.prepare(`
    SELECT lh.*, u.full_name
    FROM login_history lh
    LEFT JOIN users u ON lh.user_id = u.id
    ORDER BY lh.created_at DESC
    LIMIT ?
  `).all(limit);

  res.json(history);
});

module.exports = router;
