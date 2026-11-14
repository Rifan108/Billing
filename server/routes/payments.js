const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/', (req, res) => {
  const { method, start_date, end_date, q, limit = 100 } = req.query;

  let query = `
    SELECT
      p.*,
      i.invoice_number,
      i.grand_total,
      c.name as customer_name_linked,
      u.full_name as received_by_name
    FROM payments p
    LEFT JOIN invoices i ON p.invoice_id = i.id
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.received_by_user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (method) {
    query += ` AND p.payment_method = ?`;
    params.push(method);
  }

  if (start_date && end_date) {
    query += ` AND p.payment_date BETWEEN ? AND ?`;
    params.push(start_date, end_date);
  } else if (start_date) {
    query += ` AND p.payment_date >= ?`;
    params.push(start_date);
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query += ` AND (i.invoice_number LIKE ? OR c.name LIKE ? OR p.reference_number LIKE ?)`;
    params.push(term, term, term);
  }

  query += ` ORDER BY p.id DESC LIMIT ?`;
  params.push(parseInt(limit, 10));

  const payments = db.prepare(query).all(...params);

  // Method summary
  const summary = db.prepare(`
    SELECT
      payment_method,
      coalesce(sum(amount), 0) as total,
      count(*) as count
    FROM payments
    GROUP BY payment_method
  `).all();

  res.json({
    payments,
    summary
  });
});

module.exports = router;

