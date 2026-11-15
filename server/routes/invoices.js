const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { numberToWordsINR } = require('../services/gstEngine');
const { logAudit } = require('../services/auditService');

// List invoices with rich filtering
router.get('/', (req, res) => {
  const {
    period,
    date,
    start_date,
    end_date,
    month,
    year,
    q,
    status,
    payment_status,
    customer_id,
    limit = 100,
    offset = 0
  } = req.query;

  let query = `
    SELECT i.*, count(ii.id) as line_items_count
    FROM invoices i
    LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
    WHERE 1=1
  `;
  const params = [];

  // Period / Date filters
  if (period === 'today') {
    const today = new Date().toISOString().split('T')[0];
    query += ` AND i.invoice_date = ?`;
    params.push(today);
  } else if (period === 'weekly') {
    // Last 7 days
    query += ` AND i.invoice_date >= date('now', '-7 days')`;
  } else if (period === 'monthly') {
    const curMonth = month || new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    query += ` AND i.invoice_date LIKE ?`;
    params.push(`${curMonth}%`);
  } else if (period === 'yearly') {
    const curYear = year || new Date().getFullYear();
    query += ` AND i.invoice_date LIKE ?`;
    params.push(`${curYear}%`);
  } else if (date) {
    query += ` AND i.invoice_date = ?`;
    params.push(date);
  } else if (start_date && end_date) {
    query += ` AND i.invoice_date BETWEEN ? AND ?`;
    params.push(start_date, end_date);
  } else if (start_date) {
    query += ` AND i.invoice_date >= ?`;
    params.push(start_date);
  } else if (end_date) {
    query += ` AND i.invoice_date <= ?`;
    params.push(end_date);
  }

  // Text search (invoice#, customer name, phone)
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query += ` AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ?)`;
    params.push(term, term, term);
  }

  // Status filters
  if (status) {
    query += ` AND i.status = ?`;
    params.push(status);
  }

  if (payment_status) {
    query += ` AND i.payment_status = ?`;
    params.push(payment_status);
  }

  if (customer_id) {
    query += ` AND i.customer_id = ?`;
    params.push(customer_id);
  }

  query += ` GROUP BY i.id ORDER BY i.id DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit, 10), parseInt(offset, 10));

  const invoices = db.prepare(query).all(...params);

  // Compute summary for this filtered view
  let countQuery = `SELECT count(*) as total_count, coalesce(sum(grand_total), 0) as total_amount, coalesce(sum(total_tax_amount), 0) as total_tax, coalesce(sum(balance_due), 0) as total_due FROM invoices i WHERE 1=1`;
  const countParams = [];

  if (period === 'today') {
    const today = new Date().toISOString().split('T')[0];
    countQuery += ` AND i.invoice_date = ?`;
    countParams.push(today);
  } else if (period === 'weekly') {
    countQuery += ` AND i.invoice_date >= date('now', '-7 days')`;
  } else if (period === 'monthly') {
    const curMonth = month || new Date().toISOString().slice(0, 7);
    countQuery += ` AND i.invoice_date LIKE ?`;
    countParams.push(`${curMonth}%`);
  } else if (period === 'yearly') {
    const curYear = year || new Date().getFullYear();
    countQuery += ` AND i.invoice_date LIKE ?`;
    countParams.push(`${curYear}%`);
  } else if (date) {
    countQuery += ` AND i.invoice_date = ?`;
    countParams.push(date);
  } else if (start_date && end_date) {
    countQuery += ` AND i.invoice_date BETWEEN ? AND ?`;
    countParams.push(start_date, end_date);
  } else if (start_date) {
    countQuery += ` AND i.invoice_date >= ?`;
    countParams.push(start_date);
  } else if (end_date) {
    countQuery += ` AND i.invoice_date <= ?`;
    countParams.push(end_date);
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    countQuery += ` AND (i.invoice_number LIKE ? OR i.customer_name LIKE ? OR i.customer_phone LIKE ?)`;
    countParams.push(term, term, term);
  }
  if (status) {
    countQuery += ` AND i.status = ?`;
    countParams.push(status);
  }
  if (payment_status) {
    countQuery += ` AND i.payment_status = ?`;
    countParams.push(payment_status);
  }
  if (customer_id) {
    countQuery += ` AND i.customer_id = ?`;
    countParams.push(customer_id);
  }

  const summary = db.prepare(countQuery).get(...countParams);

  res.json({
    invoices,
    summary
  });
});

// Get single full invoice details for view / reprint / 3:4 printable receipt
router.get('/:id', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? OR invoice_number = ?').get(req.params.id, req.params.id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC').all(invoice.id);
  const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY id ASC').all(invoice.id);
  const refunds = db.prepare('SELECT * FROM refunds WHERE invoice_id = ? ORDER BY id ASC').all(invoice.id);
  const shop = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();

  res.json({
    ...invoice,
    items,
    payments,
    refunds,
    shop,
    amount_in_words: numberToWordsINR(invoice.grand_total)
  });
});

// Cancel Invoice (Admin only or staff with permission)
router.post('/:id/cancel', requireAuth, (req, res) => {
  const { id } = req.params;
  const { reason, restore_stock = true } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Cancellation reason is mandatory' });
  }

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  if (invoice.status === 'cancelled') {
    return res.status(400).json({ error: 'Invoice is already cancelled' });
  }

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);

  const txn = db.transaction(() => {
    // Update invoice status
    db.prepare(`
      UPDATE invoices
      SET status = 'cancelled', cancel_reason = ?, cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason.trim(), id);

    // Restore stock if requested
    if (restore_stock) {
      const updateProdStock = db.prepare('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const insertTxn = db.prepare(`
        INSERT INTO inventory_transactions (
          product_id, product_name, transaction_type, quantity, quantity_before, quantity_after, unit, reference_id, reason, created_by_user_id
        ) VALUES (?, ?, 'sale_cancel', ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        if (item.product_id) {
          const prod = db.prepare('SELECT stock_quantity, name, unit FROM products WHERE id = ?').get(item.product_id);
          if (prod) {
            const qtyBefore = prod.stock_quantity;
            const qtyAfter = Math.round((qtyBefore + item.quantity) * 100) / 100;
            updateProdStock.run(item.quantity, item.product_id);
            insertTxn.run(
              item.product_id,
              prod.name,
              item.quantity,
              qtyBefore,
              qtyAfter,
              prod.unit,
              invoice.invoice_number,
              `Stock restored: Cancelled invoice ${invoice.invoice_number} (${reason})`,
              req.user.id
            );
          }
        }
      }
    }

    // Adjust customer records if linked
    if (invoice.customer_id) {
      db.prepare(`
        UPDATE customers
        SET total_purchases = max(0, total_purchases - ?),
            outstanding_balance = max(0, outstanding_balance - ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(invoice.grand_total, invoice.balance_due, invoice.customer_id);
    }
  });

  txn();

  logAudit(req.user.id, req.user.full_name, 'INVOICE_CANCEL', 'invoices', id, `Cancelled invoice ${invoice.invoice_number}. Restored stock: ${restore_stock ? 'Yes' : 'No'}. Reason: ${reason}`);

  const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  res.json({
    message: 'Invoice cancelled successfully',
    invoice: updated
  });
});

// Process Refund / Credit Note
router.post('/:id/refund', requireAuth, (req, res) => {
  const { id } = req.params;
  const {
    refund_type = 'full', // 'full' or 'partial'
    refund_amount,
    refund_payment_method = 'cash',
    restock_inventory = true,
    reason,
    items_to_return = [] // array of { item_id, quantity }
  } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Refund reason is mandatory' });
  }

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  if (invoice.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot process refund for a cancelled invoice' });
  }

  const invoiceItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);

  let finalRefundTotal = 0;
  let taxableRefund = 0;
  let cgstRefund = 0;
  let sgstRefund = 0;
  let igstRefund = 0;
  let totalTaxRefund = 0;

  if (refund_type === 'full') {
    finalRefundTotal = invoice.amount_paid > 0 ? invoice.amount_paid : invoice.grand_total;
    taxableRefund = invoice.total_taxable_amount;
    cgstRefund = invoice.total_cgst;
    sgstRefund = invoice.total_sgst;
    igstRefund = invoice.total_igst;
    totalTaxRefund = invoice.total_tax_amount;
  } else {
    // Partial refund based on requested amount or returned items
    const requestedAmt = parseFloat(refund_amount);
    if (!requestedAmt || requestedAmt <= 0 || requestedAmt > invoice.grand_total) {
      return res.status(400).json({ error: 'Invalid partial refund amount specified' });
    }
    finalRefundTotal = requestedAmt;
    // Estimate taxable and tax ratio
    const taxRatio = invoice.grand_total > 0 ? invoice.total_tax_amount / invoice.grand_total : 0;
    totalTaxRefund = Math.round(finalRefundTotal * taxRatio * 100) / 100;
    taxableRefund = Math.round((finalRefundTotal - totalTaxRefund) * 100) / 100;
    if (invoice.is_inter_state) {
      igstRefund = totalTaxRefund;
    } else {
      cgstRefund = Math.round((totalTaxRefund / 2) * 100) / 100;
      sgstRefund = Math.round((totalTaxRefund - cgstRefund) * 100) / 100;
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const refundNumber = `REF-${invoice.invoice_number}-${Date.now().toString().slice(-4)}`;

  const txn = db.transaction(() => {
    // Insert into refunds
    db.prepare(`
      INSERT INTO refunds (
        invoice_id, refund_number, refund_date, customer_id, customer_name,
        refund_type, taxable_refund_amount, cgst_refund, sgst_refund,
        igst_refund, total_tax_refund, total_refund_amount, refund_payment_method,
        restock_inventory, reason, created_by_user_id
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `).run(
      id,
      refundNumber,
      today,
      invoice.customer_id,
      invoice.customer_name,
      refund_type,
      taxableRefund,
      cgstRefund,
      sgstRefund,
      igstRefund,
      totalTaxRefund,
      finalRefundTotal,
      refund_payment_method,
      restock_inventory ? 1 : 0,
      reason.trim(),
      req.user.id
    );

    // Update invoice status if full refund
    if (refund_type === 'full') {
      db.prepare("UPDATE invoices SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    }

    // Restock items if selected
    if (restock_inventory) {
      const updateStock = db.prepare('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const insertTxn = db.prepare(`
        INSERT INTO inventory_transactions (
          product_id, product_name, transaction_type, quantity, quantity_before, quantity_after, unit, reference_id, reason, created_by_user_id
        ) VALUES (?, ?, 'refund_return', ?, ?, ?, ?, ?, ?, ?)
      `);

      if (items_to_return && items_to_return.length > 0) {
        for (const ret of items_to_return) {
          const item = invoiceItems.find(i => i.id === ret.item_id || i.product_id === ret.product_id);
          if (item && item.product_id) {
            const retQty = parseFloat(ret.quantity) || item.quantity;
            const prod = db.prepare('SELECT stock_quantity, name, unit FROM products WHERE id = ?').get(item.product_id);
            if (prod) {
              const qtyBefore = prod.stock_quantity;
              const qtyAfter = Math.round((qtyBefore + retQty) * 100) / 100;
              updateStock.run(retQty, item.product_id);
              insertTxn.run(item.product_id, prod.name, retQty, qtyBefore, qtyAfter, prod.unit, refundNumber, `Restocked from refund ${refundNumber}`, req.user.id);
            }
          }
        }
      } else if (refund_type === 'full') {
        // Restock all items
        for (const item of invoiceItems) {
          if (item.product_id) {
            const prod = db.prepare('SELECT stock_quantity, name, unit FROM products WHERE id = ?').get(item.product_id);
            if (prod) {
              const qtyBefore = prod.stock_quantity;
              const qtyAfter = Math.round((qtyBefore + item.quantity) * 100) / 100;
              updateStock.run(item.quantity, item.product_id);
              insertTxn.run(item.product_id, prod.name, item.quantity, qtyBefore, qtyAfter, prod.unit, refundNumber, `Full restock from refund ${refundNumber}`, req.user.id);
            }
          }
        }
      }
    }

    // Adjust customer records if linked
    if (invoice.customer_id) {
      db.prepare(`
        UPDATE customers
        SET total_purchases = max(0, total_purchases - ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(finalRefundTotal, invoice.customer_id);
    }
  });

  txn();

  logAudit(req.user.id, req.user.full_name, 'REFUND_PROCESS', 'refunds', id, `Processed ${refund_type} refund of ₹${finalRefundTotal} for invoice ${invoice.invoice_number}`);

  res.json({
    message: 'Refund recorded successfully',
    refund_number: refundNumber,
    refund_amount: finalRefundTotal
  });
});

// Settle Payment against Invoice
router.post('/:id/payment', requireAuth, (req, res) => {
  const { id } = req.params;
  const { amount, payment_method, reference_number, notes } = req.body;

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }

  const payAmt = parseFloat(amount);
  if (!payAmt || payAmt <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  if (invoice.balance_due <= 0) {
    return res.status(400).json({ error: 'Invoice is already fully paid' });
  }

  const today = new Date().toISOString().split('T')[0];

  const txn = db.transaction(() => {
    // Record payment
    db.prepare(`
      INSERT INTO payments (invoice_id, customer_id, payment_date, payment_method, amount, reference_number, notes, received_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, invoice.customer_id, today, payment_method || 'cash', payAmt, reference_number || null, notes || `Settlement for ${invoice.invoice_number}`, req.user.id);

    const newPaid = Math.round((invoice.amount_paid + payAmt) * 100) / 100;
    const newBalance = Math.max(0, Math.round((invoice.grand_total - newPaid) * 100) / 100);
    const newStatus = newBalance <= 0 ? 'paid' : 'partial';

    db.prepare(`
      UPDATE invoices
      SET amount_paid = ?, balance_due = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newPaid, newBalance, newStatus, id);

    // Update customer outstanding if linked
    if (invoice.customer_id) {
      db.prepare(`
        UPDATE customers
        SET outstanding_balance = max(0, outstanding_balance - ?), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(payAmt, invoice.customer_id);
    }
  });

  txn();

  logAudit(req.user.id, req.user.full_name, 'INVOICE_PAYMENT', 'invoices', id, `Collected payment of ₹${payAmt} for invoice ${invoice.invoice_number} via ${payment_method}`);

  const updatedInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  res.json({
    message: 'Payment recorded successfully',
    invoice: updatedInvoice
  });
});

// WhatsApp invoice share message generator & logger
router.get('/:id/whatsapp', requireAuth, (req, res) => {
  const { id } = req.params;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const shop = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();
  const shopName = shop?.shop_name || 'Sri Lakshmi Silks & Textiles';

  // Support phone passed as query param or from invoice record
  const inputPhone = (req.query.phone || '').trim();
  const rawTargetPhone = inputPhone || invoice.customer_phone || '';

  // Clean phone digits (handles +91, leading 0, spaces, dashes)
  let digits = rawTargetPhone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);

  const isValidIndianNumber = digits.length === 10 && /^[6-9]/.test(digits);
  const internationalNumber = isValidIndianNumber ? `91${digits}` : (digits.length === 10 ? `91${digits}` : '');
  const displayPhone = digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : rawTargetPhone;

  // Persist updated phone to invoice and customer if supplied
  if (inputPhone && digits.length === 10) {
    db.prepare('UPDATE invoices SET customer_phone = ? WHERE id = ?').run(digits, id);
    if (invoice.customer_id) {
      db.prepare('UPDATE customers SET phone = ? WHERE id = ? AND (phone IS NULL OR phone = "")').run(digits, invoice.customer_id);
    }
  }

  // Professional message format
  const formattedTotal = Number(invoice.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const balanceDue = Number(invoice.balance_due || 0);

  const messageLines = [
    `Thank you for shopping with us!`,
    ``,
    `Your invoice ${invoice.invoice_number} is ready.`,
    ``,
    `Total Amount: ₹${formattedTotal}`,
    balanceDue > 0 ? `Balance Due: ₹${balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `Payment Status: Paid`,
    ``,
    `Thank you for choosing ${shopName}!`
  ];
  const message = messageLines.join('\n');

  // Record whatsapp_sent_at timestamp
  db.prepare("UPDATE invoices SET whatsapp_sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

  const encoded = encodeURIComponent(message);
  const whatsappUrl = internationalNumber ? `https://wa.me/${internationalNumber}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  const whatsappWebUrl = internationalNumber ? `https://web.whatsapp.com/send?phone=${internationalNumber}&text=${encoded}` : `https://web.whatsapp.com/send?text=${encoded}`;

  res.json({
    phone: internationalNumber,
    digits,
    displayPhone,
    isValid: isValidIndianNumber,
    message,
    whatsappUrl,
    whatsappWebUrl
  });
});

module.exports = router;

