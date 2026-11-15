const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

// Get all suppliers
router.get('/', (req, res) => {
  const { q, has_balance } = req.query;

  let query = `SELECT * FROM suppliers WHERE status = 'active'`;
  const params = [];

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query += ` AND (name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR gstin LIKE ? OR city LIKE ?)`;
    params.push(term, term, term, term, term);
  }

  if (has_balance === 'true' || has_balance === '1') {
    query += ` AND outstanding_balance > 0`;
  }

  query += ` ORDER BY name ASC`;

  const suppliers = db.prepare(query).all(...params);
  res.json(suppliers);
});

// Get single supplier details with purchases & payments
router.get('/:id', (req, res) => {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) {
    return res.status(404).json({ error: 'Supplier not found' });
  }

  const purchases = db.prepare(`
    SELECT * FROM purchases
    WHERE supplier_id = ?
    ORDER BY id DESC
  `).all(supplier.id);

  const payments = db.prepare(`
    SELECT * FROM supplier_payments
    WHERE supplier_id = ?
    ORDER BY id DESC
  `).all(supplier.id);

  res.json({
    supplier,
    purchases,
    payments
  });
});

// Create supplier
router.post('/', requireAuth, (req, res) => {
  const {
    name, company_name, phone, email, address, city, state, state_code, gstin, payment_terms
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Supplier name is required' });
  }

  const result = db.prepare(`
    INSERT INTO suppliers (
      name, company_name, phone, email, address, city, state, state_code, gstin, payment_terms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    company_name ? company_name.trim() : null,
    phone ? phone.trim() : null,
    email ? email.trim() : null,
    address ? address.trim() : null,
    city ? city.trim() : null,
    state ? state.trim() : null,
    state_code ? state_code.trim() : null,
    gstin ? gstin.trim().toUpperCase() : null,
    payment_terms || '30 Days Net'
  );

  logAudit(req.user.id, req.user.full_name, 'SUPPLIER_CREATE', 'suppliers', result.lastInsertRowid, `Created supplier ${name}`);

  const created = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// Update supplier
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const {
    name, company_name, phone, email, address, city, state, state_code, gstin, payment_terms, status
  } = req.body;

  const current = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ error: 'Supplier not found' });
  }

  db.prepare(`
    UPDATE suppliers
    SET name = ?, company_name = ?, phone = ?, email = ?, address = ?, city = ?,
        state = ?, state_code = ?, gstin = ?, payment_terms = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name ? name.trim() : current.name,
    company_name !== undefined ? company_name : current.company_name,
    phone !== undefined ? phone : current.phone,
    email !== undefined ? email : current.email,
    address !== undefined ? address : current.address,
    city !== undefined ? city : current.city,
    state !== undefined ? state : current.state,
    state_code !== undefined ? state_code : current.state_code,
    gstin !== undefined ? (gstin ? gstin.trim().toUpperCase() : null) : current.gstin,
    payment_terms || current.payment_terms,
    status || current.status,
    id
  );

  logAudit(req.user.id, req.user.full_name, 'SUPPLIER_UPDATE', 'suppliers', id, `Updated supplier ${name || current.name}`);

  const updated = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  res.json(updated);
});

// Delete supplier (soft delete)
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const current = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!current) return res.status(404).json({ error: 'Supplier not found' });

  db.prepare("UPDATE suppliers SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  logAudit(req.user.id, req.user.full_name, 'SUPPLIER_DELETE', 'suppliers', id, `Deactivated supplier ${current.name}`);

  res.json({ message: 'Supplier marked inactive successfully' });
});

// Record payment to supplier
router.post('/:id/payment', requireAuth, (req, res) => {
  const { id } = req.params;
  const { amount, payment_method, purchase_id, reference_number, notes } = req.body;

  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const payAmount = parseFloat(amount);
  if (!payAmount || payAmount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  const today = new Date().toISOString().split('T')[0];

  const txn = db.transaction(() => {
    // Insert into supplier_payments
    db.prepare(`
      INSERT INTO supplier_payments (
        supplier_id, purchase_id, payment_date, payment_method, amount, reference_number, notes, paid_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, purchase_id || null, today, payment_method || 'bank_transfer', payAmount, reference_number || null, notes || 'Supplier settlement', req.user.id);

    // Update supplier outstanding balance
    const newPaid = Math.round((supplier.total_paid + payAmount) * 100) / 100;
    const newBalance = Math.max(0, Math.round((supplier.outstanding_balance - payAmount) * 100) / 100);

    db.prepare(`
      UPDATE suppliers
      SET total_paid = ?, outstanding_balance = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newPaid, newBalance, id);

    // If purchase_id provided, update that purchase's balance
    if (purchase_id) {
      const p = db.prepare('SELECT balance_due, amount_paid, grand_total FROM purchases WHERE id = ?').get(purchase_id);
      if (p) {
        const pPaid = Math.round((p.amount_paid + payAmount) * 100) / 100;
        const pBal = Math.max(0, Math.round((p.grand_total - pPaid) * 100) / 100);
        const pStatus = pBal <= 0 ? 'paid' : 'partial';
        db.prepare('UPDATE purchases SET amount_paid = ?, balance_due = ?, payment_status = ? WHERE id = ?').run(pPaid, pBal, pStatus, purchase_id);
      }
    }
  });

  txn();

  logAudit(req.user.id, req.user.full_name, 'SUPPLIER_PAYMENT', 'suppliers', id, `Paid ₹${payAmount} to ${supplier.name} via ${payment_method}`);

  const updatedSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  res.json({
    message: 'Payment to supplier recorded successfully',
    supplier: updatedSupplier
  });
});

// Supplier Statement / Ledger
router.get('/:id/statement', (req, res) => {
  const { id } = req.params;
  const { start_date, end_date } = req.query;

  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const shop = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();

  let pQuery = `SELECT * FROM purchases WHERE supplier_id = ? AND status != 'cancelled'`;
  const pParams = [id];
  let payQuery = `SELECT * FROM supplier_payments WHERE supplier_id = ?`;
  const payParams = [id];

  if (start_date && end_date) {
    pQuery += ` AND purchase_date BETWEEN ? AND ?`;
    pParams.push(start_date, end_date);
    payQuery += ` AND payment_date BETWEEN ? AND ?`;
    payParams.push(start_date, end_date);
  }

  const purchases = db.prepare(pQuery).all(...pParams);
  const payments = db.prepare(payQuery).all(...payParams);

  const ledger = [];
  for (const p of purchases) {
    ledger.push({
      date: p.purchase_date,
      type: 'purchase',
      reference: p.purchase_invoice_number,
      description: `Purchase Invoice #${p.purchase_invoice_number} (${p.total_items_count} items)`,
      debit: 0,
      credit: p.grand_total, // Increases what we owe the supplier
      payment_method: p.payment_method
    });
  }

  for (const pay of payments) {
    ledger.push({
      date: pay.payment_date,
      type: 'payment',
      reference: pay.reference_number || `SPAY-${pay.id}`,
      description: `Payment to Supplier (${pay.notes || 'Settlement'})`,
      debit: pay.amount, // Decreases what we owe the supplier
      credit: 0,
      payment_method: pay.payment_method
    });
  }

  ledger.sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  for (const entry of ledger) {
    runningBalance = Math.round((runningBalance + (entry.credit - entry.debit)) * 100) / 100;
    entry.running_balance = runningBalance;
  }

  res.json({
    supplier,
    shop,
    ledger,
    summary: {
      total_purchases: supplier.total_purchases,
      total_paid: supplier.total_paid,
      outstanding_balance: supplier.outstanding_balance
    }
  });
});

module.exports = router;
