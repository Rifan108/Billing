const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireAdmin, idempotency } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

// List all returns and exchanges
router.get('/', (req, res) => {
  const { return_type, start_date, end_date, q } = req.query;

  let query = `
    SELECT r.*, count(ri.id) as items_count
    FROM returns r
    LEFT JOIN return_items ri ON ri.return_id = r.id
    WHERE 1=1
  `;
  const params = [];

  if (return_type) {
    query += ` AND r.return_type = ?`;
    params.push(return_type);
  }

  if (start_date && end_date) {
    query += ` AND r.return_date BETWEEN ? AND ?`;
    params.push(start_date, end_date);
  } else if (start_date) {
    query += ` AND r.return_date >= ?`;
    params.push(start_date);
  } else if (end_date) {
    query += ` AND r.return_date <= ?`;
    params.push(end_date);
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query += ` AND (r.return_number LIKE ? OR r.invoice_number LIKE ? OR r.customer_name LIKE ? OR r.customer_phone LIKE ?)`;
    params.push(term, term, term, term);
  }

  query += ` GROUP BY r.id ORDER BY r.id DESC`;

  const returns = db.prepare(query).all(...params);
  res.json(returns);
});

// Lookup invoice details for return/exchange
router.get('/lookup-invoice/:invoiceNumber', (req, res) => {
  const { invoiceNumber } = req.params;
  const invoice = db.prepare('SELECT * FROM invoices WHERE invoice_number = ? OR id = ?').get(invoiceNumber, invoiceNumber);
  if (!invoice) {
    return res.status(404).json({ error: `Invoice #${invoiceNumber} not found` });
  }

  if (invoice.status === 'cancelled') {
    return res.status(400).json({ error: `Invoice #${invoice.invoice_number} is already cancelled` });
  }

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC').all(invoice.id);

  // Compute already returned quantities
  const returnItems = db.prepare(`
    SELECT ri.invoice_item_id, sum(ri.quantity_returned) as total_returned
    FROM return_items ri
    JOIN returns r ON ri.return_id = r.id
    WHERE r.invoice_id = ?
    GROUP BY ri.invoice_item_id
  `).all(invoice.id);

  const returnMap = {};
  for (const ri of returnItems) {
    returnMap[ri.invoice_item_id] = ri.total_returned;
  }

  const itemsWithReturnStatus = items.map(item => {
    const alreadyReturned = returnMap[item.id] || 0;
    const remainingQty = Math.max(0, Math.round((item.quantity - alreadyReturned) * 100) / 100);
    return {
      ...item,
      already_returned: alreadyReturned,
      remaining_quantity: remainingQty,
      can_return: remainingQty > 0
    };
  });

  const shop = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();

  res.json({
    invoice,
    items: itemsWithReturnStatus,
    shop
  });
});

// Process a Sales Return or Product Exchange
const handleProcessReturn = (req, res) => {
  const {
    invoice_id,
    return_type = 'return', // 'return' or 'exchange'
    reason,
    refund_method = 'cash',
    notes
  } = req.body;
  const return_items = req.body.return_items || req.body.items;
  const exchange_items = req.body.exchange_items || [];

  if (!invoice_id) return res.status(400).json({ error: 'Invoice ID is required' });
  if (!return_items || !Array.isArray(return_items) || return_items.length === 0) {
    return res.status(400).json({ error: 'Please select items to return' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Return reason is required' });
  }

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice_id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const today = new Date().toISOString().split('T')[0];
  const time = new Date().toTimeString().split(' ')[0].slice(0, 5);
  const returnPrefix = return_type === 'exchange' ? 'EXC' : 'RET';
  const returnNumber = `${returnPrefix}-${Date.now().toString().slice(-6)}`;

  // Validate return quantities against original items
  let totalReturnAmount = 0;
  let totalTaxReversed = 0;
  let totalCgstReversed = 0;
  let totalSgstReversed = 0;
  let totalIgstReversed = 0;

  const validatedReturnItems = [];

  for (const ret of return_items) {
    const invItem = db.prepare('SELECT * FROM invoice_items WHERE id = ? AND invoice_id = ?').get(ret.invoice_item_id, invoice_id);
    if (!invItem) continue;

    // Check prior returns
    const prevReturned = db.prepare(`
      SELECT sum(ri.quantity_returned) as returned
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      WHERE ri.invoice_item_id = ?
    `).get(invItem.id).returned || 0;

    const maxReturnable = Math.max(0, Math.round((invItem.quantity - prevReturned) * 100) / 100);
    const rawQty = ret.quantity_returned !== undefined ? ret.quantity_returned : ret.quantity;
    const requestedQty = parseFloat(rawQty) || 0;

    if (maxReturnable <= 0) {
      return res.status(400).json({
        error: `Item "${invItem.product_name}" has already been completely returned.`
      });
    }

    if (requestedQty <= 0) {
      return res.status(400).json({
        error: `Invalid return quantity specified for "${invItem.product_name}".`
      });
    }

    if (requestedQty > maxReturnable) {
      return res.status(400).json({
        error: `Cannot return ${requestedQty} units of "${invItem.product_name}". Maximum returnable is ${maxReturnable}.`
      });
    }

    const returnQty = requestedQty;

    // Calculate item refund amount & tax portion proportionally
    const lineFraction = returnQty / invItem.quantity;
    const itemRefundAmt = Math.round(invItem.final_amount * lineFraction * 100) / 100;
    const itemTaxRev = Math.round(invItem.total_tax * lineFraction * 100) / 100;
    const cgstRev = Math.round(invItem.cgst_amount * lineFraction * 100) / 100;
    const sgstRev = Math.round(invItem.sgst_amount * lineFraction * 100) / 100;
    const igstRev = Math.round(invItem.igst_amount * lineFraction * 100) / 100;

    totalReturnAmount += itemRefundAmt;
    totalTaxReversed += itemTaxRev;
    totalCgstReversed += cgstRev;
    totalSgstReversed += sgstRev;
    totalIgstReversed += igstRev;

    validatedReturnItems.push({
      invoice_item_id: invItem.id,
      product_id: invItem.product_id,
      variant_id: invItem.variant_id,
      product_name: invItem.product_name,
      sku: invItem.sku,
      unit: invItem.unit,
      quantity_returned: returnQty,
      rate: invItem.rate,
      gst_rate: invItem.gst_rate,
      tax_reversed: itemTaxRev,
      item_refund_amount: itemRefundAmt,
      condition: ret.condition || 'undamaged',
      restocked: ret.condition !== 'damaged' ? 1 : 0
    });
  }

  if (validatedReturnItems.length === 0) {
    return res.status(400).json({ error: 'No valid returnable quantity for selected items' });
  }

  // Calculate Exchange items value if exchange
  let exchangeTotal = 0;
  if (return_type === 'exchange' && Array.isArray(exchange_items)) {
    for (const ex of exchange_items) {
      const q = Math.max(0.01, parseFloat(ex.quantity) || 1);
      const r = Math.max(0, parseFloat(ex.rate) || 0);
      const gst = parseFloat(ex.gst_rate) || 5.0;
      const net = q * r;
      const tax = Math.round((net * (gst / 100)) * 100) / 100;
      exchangeTotal += (net + tax);
    }
  }

  exchangeTotal = Math.round(exchangeTotal * 100) / 100;
  totalReturnAmount = Math.round(totalReturnAmount * 100) / 100;

  // net_amount_payable: positive means customer owes difference, negative means refund to customer
  const netPayable = Math.round((exchangeTotal - totalReturnAmount) * 100) / 100;

  let newReturnId;

  const userId = (req.user && req.user.id) || 1;
  const userName = (req.user && req.user.full_name) || 'Admin';

  const txn = db.transaction(() => {
    // 1. Insert return record
    const resReturn = db.prepare(`
      INSERT INTO returns (
        return_number, return_date, return_time, invoice_id, invoice_number,
        customer_id, customer_name, customer_phone, return_type, total_return_items,
        total_return_amount, total_tax_reversed, cgst_reversed, sgst_reversed, igst_reversed,
        exchange_items_amount, net_amount_payable, refund_method, refund_status,
        reason, condition, restocked, notes, handled_by_user_id, handled_by_name
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, 'completed',
        ?, ?, ?, ?, ?, ?
      )
    `).run(
      returnNumber,
      today,
      time,
      invoice.id,
      invoice.invoice_number,
      invoice.customer_id,
      invoice.customer_name,
      invoice.customer_phone,
      return_type,
      validatedReturnItems.length,
      totalReturnAmount,
      totalTaxReversed,
      totalCgstReversed,
      totalSgstReversed,
      totalIgstReversed,
      exchangeTotal,
      netPayable,
      refund_method,
      reason.trim(),
      validatedReturnItems.some(i => i.condition === 'damaged') ? 'damaged' : 'undamaged',
      validatedReturnItems.some(i => i.restocked) ? 1 : 0,
      notes ? notes.trim() : null,
      userId,
      userName
    );

    newReturnId = resReturn.lastInsertRowid;

    // 2. Insert return_items & restock if undamaged
    const insertRetItem = db.prepare(`
      INSERT INTO return_items (
        return_id, invoice_item_id, product_id, variant_id, product_name, sku,
        unit, quantity_returned, rate, gst_rate, tax_reversed, item_refund_amount,
        condition, restocked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateProdStock = db.prepare('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const updateVarStock = db.prepare('UPDATE product_variants SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const insertTxn = db.prepare(`
      INSERT INTO inventory_transactions (
        product_id, product_name, transaction_type, quantity, quantity_before, quantity_after, unit, reference_id, reason, created_by_user_id
      ) VALUES (?, ?, 'refund_return', ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of validatedReturnItems) {
      insertRetItem.run(
        newReturnId,
        item.invoice_item_id,
        item.product_id,
        item.variant_id,
        item.product_name,
        item.sku,
        item.unit,
        item.quantity_returned,
        item.rate,
        item.gst_rate,
        item.tax_reversed,
        item.item_refund_amount,
        item.condition,
        item.restocked
      );

      // Update invoice_items returned_quantity column
      db.prepare('UPDATE invoice_items SET returned_quantity = returned_quantity + ? WHERE id = ?').run(item.quantity_returned, item.invoice_item_id);

      // Restock inventory if undamaged
      if (item.restocked) {
        if (item.variant_id) {
          updateVarStock.run(item.quantity_returned, item.variant_id);
        }
        if (item.product_id) {
          const prod = db.prepare('SELECT stock_quantity, name, unit FROM products WHERE id = ?').get(item.product_id);
          if (prod) {
            const qtyBefore = prod.stock_quantity;
            const qtyAfter = Math.round((qtyBefore + item.quantity_returned) * 100) / 100;
            updateProdStock.run(item.quantity_returned, item.product_id);
            insertTxn.run(
              item.product_id,
              prod.name + (item.sku ? ` (${item.sku})` : ''),
              item.quantity_returned,
              qtyBefore,
              qtyAfter,
              prod.unit,
              returnNumber,
              `Return/Exchange #${returnNumber} (${item.condition})`,
              req.user.id
            );
          }
        }
      }
    }

    // 3. Deduct stock for replacement items in exchange
    if (return_type === 'exchange' && Array.isArray(exchange_items)) {
      for (const ex of exchange_items) {
        const exQty = parseFloat(ex.quantity) || 1;
        if (ex.variant_id) {
          db.prepare('UPDATE product_variants SET stock_quantity = max(0, stock_quantity - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(exQty, ex.variant_id);
        }
        if (ex.product_id) {
          const prod = db.prepare('SELECT stock_quantity, name, unit FROM products WHERE id = ?').get(ex.product_id);
          if (prod) {
            const qtyBefore = prod.stock_quantity;
            const qtyAfter = Math.max(0, Math.round((qtyBefore - exQty) * 100) / 100);
            db.prepare('UPDATE products SET stock_quantity = ? WHERE id = ?').run(qtyAfter, ex.product_id);
            db.prepare(`
              INSERT INTO inventory_transactions (
                product_id, product_name, transaction_type, quantity, quantity_before, quantity_after, unit, reference_id, reason, created_by_user_id
              ) VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?, ?)
            `).run(ex.product_id, prod.name, -exQty, qtyBefore, qtyAfter, prod.unit, returnNumber, `Exchange replacement for ${returnNumber}`, req.user.id);
          }
        }
      }
    }

    // 4. Update customer outstanding balance if applicable
    if (invoice.customer_id) {
      if (return_type === 'return') {
        // Reduce outstanding balance by returned amount (up to existing balance)
        db.prepare(`
          UPDATE customers
          SET outstanding_balance = max(0, outstanding_balance - ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(totalReturnAmount, invoice.customer_id);
      } else if (return_type === 'exchange') {
        // If netPayable is positive and unpaid, increases customer balance
        if (netPayable > 0 && refund_method === 'credit') {
          db.prepare(`
            UPDATE customers
            SET outstanding_balance = outstanding_balance + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(netPayable, invoice.customer_id);
        }
      }
    }
  });

  txn();

  logAudit(userId, userName, 'RETURN_PROCESS', 'returns', newReturnId, `Processed ${return_type} #${returnNumber} for invoice ${invoice.invoice_number}`);

  const createdReturn = db.prepare('SELECT * FROM returns WHERE id = ?').get(newReturnId);
  const items = db.prepare('SELECT * FROM return_items WHERE return_id = ?').all(newReturnId);
  const shop = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();

  res.status(201).json({
    message: `${return_type === 'exchange' ? 'Exchange' : 'Return'} processed successfully`,
    return: createdReturn,
    items,
    shop
  });
};

router.post('/', requireAuth, idempotency, handleProcessReturn);
router.post('/process', requireAuth, idempotency, handleProcessReturn);

// Get single return details for receipt printing
router.get('/:id', (req, res) => {
  const ret = db.prepare('SELECT * FROM returns WHERE id = ? OR return_number = ?').get(req.params.id, req.params.id);
  if (!ret) return res.status(404).json({ error: 'Return transaction not found' });

  const items = db.prepare('SELECT * FROM return_items WHERE return_id = ?').all(ret.id);
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(ret.invoice_id);
  const shop = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();

  res.json({
    ...ret,
    items,
    invoice,
    shop
  });
});

module.exports = router;
