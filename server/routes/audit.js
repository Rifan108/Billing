const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');

// Get audit logs
router.get('/', requireAdmin, (req, res) => {
  const { action, limit = 100 } = req.query;

  let query = `SELECT * FROM audit_logs WHERE 1=1`;
  const params = [];

  if (action) {
    query += ` AND action = ?`;
    params.push(action);
  }

  query += ` ORDER BY id DESC LIMIT ?`;
  params.push(parseInt(limit, 10));

  const logs = db.prepare(query).all(...params);
  res.json(logs);
});

module.exports = router;

