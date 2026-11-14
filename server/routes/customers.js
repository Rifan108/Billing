const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

// Get all customers with search and outstanding filter
router.get('/', (req, res) => {
  const { q, has_balance } = req.query;

  let query = `SELECT * FROM customers WHERE 1=1`;
  const params = [];

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query += ` AND (name LIKE ? OR phone LIKE ? OR gstin LIKE ? OR city LIKE ?)`;
    params.push(term, term, term, term);
  }

  if (has_balance === 'true' || has_balance === '1') {
    query += ` AND outstanding_balance > 0`;
  }

  query += ` ORDER BY last_purchase_date DESC NULLS LAST, name ASC`;

  const customers = db.prepare(query).all(...params);
  res.json(customers);
});

// Get single customer details with invoices
router.get('/:id', (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const invoices = db.prepare(`
    SELECT id, invoice_number, invoice_date, invoice_time, total_items_count, grand_total, amount_paid, balance_due, payment_status, status
    FROM invoices
    WHERE customer_id = ?
    ORDER BY id DESC
  `).all(customer.id);

  const payments = db.prepare(`
    SELECT * FROM payments
    WHERE customer_id = ?
    ORDER BY id DESC
  `).all(customer.id);

  res.json({
    customer,
    invoices,
    payments
  });
});

// Create customer
router.post('/', requireAuth, (req, res) => {
  const { name, phone, email, address, city, state, state_code, gstin } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }

  if (phone && phone.trim()) {
    const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone.trim());
    if (existing) {
      return res.status(400).json({ error: 'A customer with this mobile number already exists' });
    }
  }

  const result = db.prepare(`
    INSERT INTO customers (name, phone, email, address, city, state, state_code, gstin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    phone ? phone.trim() : null,
    email ? email.trim() : null,
    address ? address.trim() : null,
    city ? city.trim() : null,
    state ? state.trim() : null,
    state_code ? state_code.trim() : null,
    gstin ? gstin.trim().toUpperCase() : null
  );

  logAudit(req.user.id, req.user.full_name, 'CUSTOMER_CREATE', 'customers', result.lastInsertRowid, `Created customer profile: ${name}`);

  const created = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// Update customer
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { name, phone, email, address, city, state, state_code, gstin } = req.body;

  const current = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  if (phone && phone.trim() !== current.phone) {
    const existing = db.prepare('SELECT id FROM customers WHERE phone = ? AND id != ?').get(phone.trim(), id);
    if (existing) {
      return res.status(400).json({ error: 'A customer with this mobile number already exists' });
    }
  }

  db.prepare(`
    UPDATE customers
    SET name = ?, phone = ?, email = ?, address = ?, city = ?, state = ?, state_code = ?, gstin = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name ? name.trim() : current.name,
    phone !== undefined ? (phone ? phone.trim() : null) : current.phone,
    email !== undefined ? (email ? email.trim() : null) : current.email,
    address !== undefined ? (address ? address.trim() : null) : current.address,
    city !== undefined ? (city ? city.trim() : null) : current.city,
    state !== undefined ? (state ? state.trim() : null) : current.state,
    state_code !== undefined ? (state_code ? state_code.trim() : null) : current.state_code,
    gstin !== undefined ? (gstin ? gstin.trim().toUpperCase() : null) : current.gstin,
    id
  );

  logAudit(req.user.id, req.user.full_name, 'CUSTOMER_UPDATE', 'customers', id, `Updated customer profile: ${name || current.name}`);

  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  res.json(updated);
});

// Record customer outstanding settlement payment
router.post('/:id/payment', requireAuth, (req, res) => {
  const { id } = req.params;
  const { amount, payment_method, reference_number, notes } = req.body;

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const payAmount = parseFloat(amount);
  if (!payAmount || payAmount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  const today = new Date().toISOString().split('T')[0];

  const txn = db.transaction(() => {
    // Insert into payments
    db.prepare(`
      INSERT INTO payments (customer_id, payment_date, payment_method, amount, reference_number, notes, received_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, today, payment_method || 'cash', payAmount, reference_number || null, notes || 'Outstanding settlement', req.user.id);

    // Update customer outstanding
    const newBalance = Math.max(0, Math.round((customer.outstanding_balance - payAmount) * 100) / 100);
    db.prepare('UPDATE customers SET outstanding_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBalance, id);

    // Also distribute this payment to unpaid/partially paid invoices of this customer from oldest to newest
    let remainingPayment = payAmount;
    const unpaidInvoices = db.prepare(`
      SELECT id, balance_due, amount_paid, grand_total
      FROM invoices
      WHERE customer_id = ? AND status = 'active' AND balance_due > 0
      ORDER BY id ASC
    `).all(id);

    for (const inv of unpaidInvoices) {
      if (remainingPayment <= 0) break;
      const settleAmount = Math.min(remainingPayment, inv.balance_due);
      const updatedBalance = Math.round((inv.balance_due - settleAmount) * 100) / 100;
      const updatedPaid = Math.round((inv.amount_paid + settleAmount) * 100) / 100;
      const newStatus = updatedBalance <= 0 ? 'paid' : 'partial';

      db.prepare(`
        UPDATE invoices
        SET balance_due = ?, amount_paid = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(updatedBalance, updatedPaid, newStatus, inv.id);

      remainingPayment = Math.round((remainingPayment - settleAmount) * 100) / 100;
    }
  });

  txn();

  logAudit(req.user.id, req.user.full_name, 'CUSTOMER_PAYMENT', 'customers', id, `Received ₹${payAmount} payment via ${payment_method} from ${customer.name}`);

  const updatedCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  res.json({
    message: 'Payment recorded and credited successfully',
    customer: updatedCustomer
  });
});

module.exports = router;

