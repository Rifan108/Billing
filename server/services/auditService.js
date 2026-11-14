const db = require('../database');

function logAudit(userId, userName, action, entityType = null, entityId = null, details = null, ipAddress = null) {
  try {
    const detailsStr = typeof details === 'object' ? JSON.stringify(details) : (details || '');
    db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId || null, userName || 'System', action, entityType, entityId ? String(entityId) : null, detailsStr, ipAddress);
  } catch (err) {
    console.error('Audit logging failed:', err.message);
  }
}

module.exports = {
  logAudit
};

