const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { requireAuth, requireAdmin, generateToken } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (!user || user.status !== 'active') {
    return res.status(401).json({ error: 'Invalid username or user account is inactive' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  logAudit(user.id, user.full_name, 'LOGIN', 'users', user.id, 'User logged in successfully', req.ip);

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
  const user = db.prepare('SELECT id, username, full_name, role, phone, status, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

// List all users (admin only)
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, full_name, role, phone, status, created_at, updated_at FROM users ORDER BY id ASC').all();
  res.json(users);
});

// Create user (admin only)
router.post('/users', requireAdmin, (req, res) => {
  const { username, password, full_name, role, phone } = req.body;
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Username, password, full name, and role are required' });
  }

  if (!['admin', 'staff'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or staff' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, phone, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(username.trim().toLowerCase(), hash, full_name.trim(), role, phone ? phone.trim() : null);

  logAudit(req.user.id, req.user.full_name, 'USER_CREATE', 'users', result.lastInsertRowid, `Created user ${username} with role ${role}`);

  res.status(201).json({
    id: result.lastInsertRowid,
    username: username.trim().toLowerCase(),
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

  let hash = user.password_hash;
  if (password && password.trim().length > 0) {
    hash = bcrypt.hashSync(password, 10);
  }

  db.prepare(`
    UPDATE users
    SET full_name = ?, role = ?, phone = ?, status = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    full_name ? full_name.trim() : user.full_name,
    role || user.role,
    phone !== undefined ? phone : user.phone,
    status || user.status,
    hash,
    id
  );

  logAudit(req.user.id, req.user.full_name, 'USER_UPDATE', 'users', id, `Updated user ${user.username}`);

  res.json({ message: 'User updated successfully' });
});

// Change password for logged in user
router.put('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Incorrect current password' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, req.user.id);

  logAudit(req.user.id, req.user.full_name, 'PASSWORD_CHANGE', 'users', req.user.id, 'User changed own password');

  res.json({ message: 'Password changed successfully' });
});

module.exports = router;

