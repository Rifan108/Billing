const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

// Get all purchase invoices
router.get('/', (req, res) => {
  const { supplier_id, payment_status, start_date, end_date, q } = req.query;

  let query = `
    SELECT p.*, s.company_name, s.phone as supplier_phone
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (supplier_id) {
    query += ` AND p.supplier_id = ?`;
    params.push(supplier_id);
  }

  if (payment_status) {
    query += ` AND p.payment_status = ?`;
    params.push(payment_status);
  }

  if (start_date && end_date) {
    query += ` AND p.purchase_date BETWEEN ? AND ?`;
    params.push(start_date, end_date);
  } else if (start_date) {
    query += ` AND p.purchase_date >= ?`;
    params.push(start_date);
  } else if (end_date) {
    query += ` AND p.purchase_date <= ?`;
    params.push(end_date);
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query += ` AND (p.purchase_invoice_number LIKE ? OR p.supplier_name LIKE ? OR s.company_name LIKE ?)`;
    params.push(term, term, term);
  }

  query += ` ORDER BY p.id DESC`;

  const purchases = db.prepare(query).all(...params);
  res.json(purchases);
});

// Get single purchase invoice details
router.get('/:id', (req, res) => {
  const purchase = db.prepare(`
    SELECT p.*, s.company_name, s.phone as supplier_phone, s.address as supplier_address, s.gstin as supplier_gstin_full
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!purchase) {
    return res.status(404).json({ error: 'Purchase invoice not found' });
  }

  const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id ASC').all(purchase.id);
  const payments = db.prepare('SELECT * FROM supplier_payments WHERE purchase_id = ? ORDER BY id ASC').all(purchase.id);
  const shop = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();

  res.json({
    ...purchase,
    items,
    payments,
    shop
  });
});

// Create purchase invoice & stock inward
router.post('/', requireAuth, (req, res) => {
  const {
    purchase_invoice_number,
    purchase_date,
    supplier_id,
    supplier_name,
    supplier_gstin,
    items,
    discount_amount = 0,
    additional_charges = 0,
    amount_paid = 0,
    payment_method = 'bank_transfer',
    notes
  } = req.body;

  if (!purchase_invoice_number || !purchase_invoice_number.trim()) {
    return res.status(400).json({ error: 'Purchase invoice number is required' });
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one purchase item is required' });
  }

  const invoiceNum = purchase_invoice_number.trim().toUpperCase();
  const existing = db.prepare('SELECT id FROM purchases WHERE purchase_invoice_number = ?').get(invoiceNum);
  if (existing) {
    return res.status(400).json({ error: `Purchase invoice #${invoiceNum} already recorded in system` });
  }

  // Lookup supplier
  let suppName = supplier_name ? supplier_name.trim() : 'Direct Supplier';
  let suppGstin = supplier_gstin ? supplier_gstin.trim().toUpperCase() : null;
  let resolvedSupplierId = supplier_id ? parseInt(supplier_id) : null;

  if (resolvedSupplierId) {
    const s = db.prepare('SELECT id, name, gstin FROM suppliers WHERE id = ?').get(resolvedSupplierId);
    if (s) {
      suppName = s.name;
      suppGstin = s.gstin || suppGstin;
    }
  }

  // Calculate items financials
  let subtotal = 0;
  let totalTax = 0;
  const processedItems = [];

  for (const item of items) {
    const qty = Math.max(0.01, parseFloat(item.quantity) || 1);
    const cost = Math.max(0, parseFloat(item.purchase_cost) || 0);
    const discPct = Math.max(0, parseFloat(item.discount_percent) || 0);
    const rawCost = qty * cost;
    const discAmt = rawCost * (discPct / 100);
    const netCost = rawCost - discAmt;
    const gstRate = parseFloat(item.gst_rate) || 5.0;
    const taxAmt = Math.round((netCost * (gstRate / 100)) * 100) / 100;
    const totalLineCost = Math.round((netCost + taxAmt) * 100) / 100;

    subtotal += netCost;
    totalTax += taxAmt;

    processedItems.push({
      product_id: item.product_id ? parseInt(item.product_id) : null,
      variant_id: item.variant_id ? parseInt(item.variant_id) : null,
      product_name: item.product_name || 'Fabric Stock',
      sku: item.sku || '',
      hsn_code: item.hsn_code || '5208',
      unit: item.unit || 'Pieces',
      quantity: qty,
      purchase_cost: cost,
      discount_percent: discPct,
      gst_rate: gstRate,
      tax_amount: taxAmt,
      total_cost: totalLineCost
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;
  totalTax = Math.round(totalTax * 100) / 100;
  const discTotal = Math.max(0, parseFloat(discount_amount) || 0);
  const addCharges = Math.max(0, parseFloat(additional_charges) || 0);
  const grandTotal = Math.round((subtotal + totalTax - discTotal + addCharges) * 100) / 100;

  const paid = Math.min(grandTotal, Math.max(0, parseFloat(amount_paid) || 0));
  const balanceDue = Math.max(0, Math.round((grandTotal - paid) * 100) / 100);
  const paymentStatus = balanceDue <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');
  const dateStr = purchase_date || new Date().toISOString().split('T')[0];

  let newPurchaseId;

  const transaction = db.transaction(() => {
    // Insert into purchases
    const resPurch = db.prepare(`
      INSERT INTO purchases (
        purchase_invoice_number, purchase_date, supplier_id, supplier_name, supplier_gstin,
        total_items_count, subtotal, tax_amount, discount_amount, additional_charges,
        grand_total, amount_paid, balance_due, payment_status, payment_method,
        status, notes, created_by_user_id
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        'active', ?, ?
      )
    `).run(
      invoiceNum,
      dateStr,
      resolvedSupplierId,
      suppName,
      suppGstin,
      processedItems.length,
      subtotal,
      totalTax,
      discTotal,
      addCharges,
      grandTotal,
      paid,
      balanceDue,
      paymentStatus,
      payment_method,
      notes ? notes.trim() : null,
      req.user.id
    );

    newPurchaseId = resPurch.lastInsertRowid;

    // Insert purchase_items & increment stock
    const insertPItem = db.prepare(`
      INSERT INTO purchase_items (
        purchase_id, product_id, variant_id, product_name, sku, hsn_code, unit,
        quantity, purchase_cost, discount_percent, gst_rate, tax_amount, total_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateProdStock = db.prepare(`
      UPDATE products
      SET stock_quantity = stock_quantity + ?, purchase_price = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const updateVarStock = db.prepare(`
      UPDATE product_variants
      SET stock_quantity = stock_quantity + ?, purchase_price = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const insertTxn = db.prepare(`
      INSERT INTO inventory_transactions (
        product_id, product_name, transaction_type, quantity, quantity_before, quantity_after, unit, reference_id, reason, created_by_user_id
      ) VALUES (?, ?, 'stock_in', ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const pi of processedItems) {
      insertPItem.run(
        newPurchaseId,
        pi.product_id,
        pi.variant_id,
        pi.product_name,
        pi.sku,
        pi.hsn_code,
        pi.unit,
        pi.quantity,
        pi.purchase_cost,
        pi.discount_percent,
        pi.gst_rate,
        pi.tax_amount,
        pi.total_cost
      );

      // Increment variant stock if linked
      if (pi.variant_id) {
        updateVarStock.run(pi.quantity, pi.purchase_cost, pi.variant_id);
      }

      // Increment parent product stock
      if (pi.product_id) {
        const prod = db.prepare('SELECT stock_quantity, name, unit FROM products WHERE id = ?').get(pi.product_id);
        if (prod) {
          const qtyBefore = prod.stock_quantity;
          const qtyAfter = Math.round((qtyBefore + pi.quantity) * 100) / 100;
          updateProdStock.run(pi.quantity, pi.purchase_cost, pi.product_id);
          insertTxn.run(
            pi.product_id,
            prod.name + (pi.sku ? ` (${pi.sku})` : ''),
            pi.quantity,
            qtyBefore,
            qtyAfter,
            prod.unit,
            invoiceNum,
            `Purchase inward #${invoiceNum} from ${suppName}`,
            req.user.id
          );
        }
      }
    }

    // Record payment if paid > 0
    if (paid > 0 && resolvedSupplierId) {
      db.prepare(`
        INSERT INTO supplier_payments (
          supplier_id, purchase_id, payment_date, payment_method, amount, reference_number, notes, paid_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        resolvedSupplierId,
        newPurchaseId,
        dateStr,
        payment_method,
        paid,
        `PUR-${invoiceNum}`,
        `Payment on purchase invoice #${invoiceNum}`,
        req.user.id
      );
    }

    // Update supplier balance
    if (resolvedSupplierId) {
      db.prepare(`
        UPDATE suppliers
        SET total_purchases = total_purchases + ?,
            total_paid = total_paid + ?,
            outstanding_balance = outstanding_balance + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(grandTotal, paid, balanceDue, resolvedSupplierId);
    }
  });

  transaction();

  logAudit(req.user.id, req.user.full_name, 'PURCHASE_CREATE', 'purchases', newPurchaseId, `Recorded purchase invoice #${invoiceNum} from ${suppName} for ₹${grandTotal}`);

  const created = db.prepare('SELECT * FROM purchases WHERE id = ?').get(newPurchaseId);
  res.status(201).json(created);
});

// Cancel purchase invoice and reverse stock
router.post('/:id/cancel', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
  if (!purchase) return res.status(404).json({ error: 'Purchase invoice not found' });
  if (purchase.status === 'cancelled') return res.status(400).json({ error: 'Purchase is already cancelled' });

  const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ?').all(id);

  const txn = db.transaction(() => {
    db.prepare("UPDATE purchases SET status = 'cancelled', notes = coalesce(notes || ' | ', '') || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(`Cancelled: ${reason || 'Manual reversal'}`, id);

    // Revert stock
    for (const item of items) {
      if (item.variant_id) {
        db.prepare('UPDATE product_variants SET stock_quantity = max(0, stock_quantity - ?) WHERE id = ?').run(item.quantity, item.variant_id);
      }
      if (item.product_id) {
        const prod = db.prepare('SELECT stock_quantity, name, unit FROM products WHERE id = ?').get(item.product_id);
        if (prod) {
          const qtyBefore = prod.stock_quantity;
          const qtyAfter = Math.max(0, Math.round((qtyBefore - item.quantity) * 100) / 100);
          db.prepare('UPDATE products SET stock_quantity = ? WHERE id = ?').run(qtyAfter, item.product_id);
          db.prepare(`
            INSERT INTO inventory_transactions (
              product_id, product_name, transaction_type, quantity, quantity_before, quantity_after, unit, reference_id, reason, created_by_user_id
            ) VALUES (?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, ?)
          `).run(item.product_id, prod.name, -item.quantity, qtyBefore, qtyAfter, prod.unit, purchase.purchase_invoice_number, `Reversal of cancelled purchase #${purchase.purchase_invoice_number}`, req.user.id);
        }
      }
    }

    // Revert supplier balance
    if (purchase.supplier_id) {
      db.prepare(`
        UPDATE suppliers
        SET total_purchases = max(0, total_purchases - ?),
            outstanding_balance = max(0, outstanding_balance - ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(purchase.grandTotal || purchase.grand_total, purchase.balanceDue || purchase.balance_due, purchase.supplier_id);
    }
  });

  txn();

  logAudit(req.user.id, req.user.full_name, 'PURCHASE_CANCEL', 'purchases', id, `Cancelled purchase invoice #${purchase.purchase_invoice_number}`);

  res.json({ message: 'Purchase invoice cancelled and inventory reversed' });
});

module.exports = router;
