const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { calculateInvoiceTotals, numberToWordsINR, getStateByName } = require('../services/gstEngine');
const { logAudit } = require('../services/auditService');

// Quick search products for billing
router.get('/search-products', (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    // Return top 20 active products
    const products = db.prepare(`
      SELECT p.*, c.name as category_display_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.status = 'active'
      ORDER BY p.name ASC
      LIMIT 20
    `).all();
    return res.json(products);
  }

  const term = `%${q.trim()}%`;
  const exact = q.trim();

  // Search by exact barcode or SKU first, then by name
  const products = db.prepare(`
    SELECT p.*, c.name as category_display_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'active'
      AND (p.barcode = ? OR lower(p.sku) = lower(?) OR p.name LIKE ? OR p.hsn_code LIKE ?)
    ORDER BY
      CASE WHEN p.barcode = ? THEN 1
           WHEN lower(p.sku) = lower(?) THEN 2
           ELSE 3 END,
      p.name ASC
    LIMIT 30
  `).all(exact, exact, term, term, exact, exact);

  res.json(products);
});

// Quick search customers for billing
router.get('/search-customers', (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    const customers = db.prepare('SELECT * FROM customers ORDER BY last_purchase_date DESC NULLS LAST LIMIT 15').all();
    return res.json(customers);
  }

  const term = `%${q.trim()}%`;
  const customers = db.prepare(`
    SELECT * FROM customers
    WHERE phone LIKE ? OR name LIKE ? OR gstin LIKE ?
    ORDER BY last_purchase_date DESC NULLS LAST
    LIMIT 20
  `).all(term, term, term);

  res.json(customers);
});

// Create new invoice with full atomic transaction
router.post('/create-invoice', requireAuth, (req, res) => {
  const {
    customer_id,
    customer_name,
    customer_phone,
    customer_address,
    customer_gstin,
    place_of_supply,
    place_of_supply_code,
    items,
    bill_discount_type = 'flat',
    bill_discount_value = 0,
    payment_method = 'cash',
    amount_paid,
    split_payments = [], // array of { method, amount, reference }
    notes
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invoice must contain at least one product line item' });
  }

  const shop = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();
  if (!shop) {
    return res.status(500).json({ error: 'Shop settings configuration missing' });
  }

  // Determine intra-state vs inter-state
  // If customer state or place of supply is different from shop state, it is inter-state
  let isInterState = false;
  let resolvedPosName = place_of_supply || shop.state;
  let resolvedPosCode = place_of_supply_code || shop.state_code;

  if (resolvedPosCode && shop.state_code && resolvedPosCode.trim() !== shop.state_code.trim()) {
    isInterState = true;
  } else if (resolvedPosName && shop.state && resolvedPosName.trim().toLowerCase() !== shop.state.trim().toLowerCase()) {
    isInterState = true;
  }

  // Calculate totals via GST Engine
  const totals = calculateInvoiceTotals({
    items,
    billDiscountType: bill_discount_type,
    billDiscountValue: bill_discount_value,
    isInterState,
    amountPaid: amount_paid !== undefined ? parseFloat(amount_paid) : 0
  });

  const now = new Date();
  const invoiceDate = now.toISOString().split('T')[0];
  const invoiceTime = now.toTimeString().split(' ')[0];

  let createdInvoiceId;
  let finalInvoiceNumber;

  const invoiceTransaction = db.transaction(() => {
    // Generate next invoice number
    // Find highest invoice number with current prefix
    const prefix = shop.invoice_prefix || 'TEX';
    const lastInvoice = db.prepare(`
      SELECT invoice_number FROM invoices
      WHERE invoice_number LIKE ?
      ORDER BY id DESC LIMIT 1
    `).get(`${prefix}-%`);

    let nextNum = shop.invoice_starting_number || 1001;
    if (lastInvoice && lastInvoice.invoice_number) {
      const parts = lastInvoice.invoice_number.split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num >= nextNum) {
        nextNum = num + 1;
      }
    }
    finalInvoiceNumber = `${prefix}-${nextNum}`;

    // Handle customer registration / linking
    let resolvedCustomerId = customer_id || null;
    let custName = customer_name ? customer_name.trim() : 'Walk-in Customer';
    let custPhone = customer_phone ? customer_phone.trim() : null;

    if (!resolvedCustomerId && custPhone) {
      const existingCust = db.prepare('SELECT id, name FROM customers WHERE phone = ?').get(custPhone);
      if (existingCust) {
        resolvedCustomerId = existingCust.id;
        custName = existingCust.name;
      } else if (custName !== 'Walk-in Customer') {
        // Auto register new customer
        const insertCust = db.prepare(`
          INSERT INTO customers (name, phone, address, state, state_code, gstin)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(custName, custPhone, customer_address || null, resolvedPosName, resolvedPosCode, customer_gstin ? customer_gstin.trim().toUpperCase() : null);
        resolvedCustomerId = insertCust.lastInsertRowid;
      }
    }

    // Insert Invoice
    const insertInv = db.prepare(`
      INSERT INTO invoices (
        invoice_number, invoice_date, invoice_time, customer_id, customer_name,
        customer_phone, customer_address, customer_gstin, place_of_supply,
        place_of_supply_code, is_inter_state, total_items_count, subtotal_raw,
        total_product_discount, bill_discount_type, bill_discount_value,
        total_bill_discount, total_taxable_amount, total_cgst, total_sgst,
        total_igst, total_tax_amount, round_off, grand_total, amount_paid,
        balance_due, payment_method, payment_status, status, notes,
        billed_by_user_id, billed_by_name
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, 'active', ?,
        ?, ?
      )
    `);

    const invResult = insertInv.run(
      finalInvoiceNumber,
      invoiceDate,
      invoiceTime,
      resolvedCustomerId,
      custName,
      custPhone,
      customer_address ? customer_address.trim() : null,
      customer_gstin ? customer_gstin.trim().toUpperCase() : null,
      resolvedPosName,
      resolvedPosCode,
      isInterState ? 1 : 0,
      totals.processedItems.length,
      totals.subtotalRaw,
      totals.totalProductDiscount,
      totals.billDiscountType,
      totals.billDiscountValue,
      totals.totalBillDiscount,
      totals.totalTaxableAmount,
      totals.totalCgst,
      totals.totalSgst,
      totals.totalIgst,
      totals.totalTaxAmount,
      totals.roundOff,
      totals.grandTotal,
      totals.amountPaid,
      totals.balanceDue,
      payment_method,
      totals.paymentStatus,
      notes ? notes.trim() : null,
      req.user.id,
      req.user.full_name
    );

    createdInvoiceId = invResult.lastInsertRowid;

    // Insert Line Items & Deduct Stock
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (
        invoice_id, product_id, product_name, sku, hsn_code, category_name,
        unit, quantity, rate, discount_type, discount_value, discount_amount,
        taxable_amount, gst_rate, is_inter_state, cgst_rate, cgst_amount,
        sgst_rate, sgst_amount, igst_rate, igst_amount, total_tax, final_amount
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    const updateProductStock = db.prepare(`
      UPDATE products
      SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const insertTxn = db.prepare(`
      INSERT INTO inventory_transactions (
        product_id, product_name, transaction_type, quantity, quantity_before,
        quantity_after, unit, reference_id, reason, created_by_user_id
      ) VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of totals.processedItems) {
      insertItem.run(
        createdInvoiceId,
        item.product_id || null,
        item.name || item.product_name,
        item.sku || '',
        item.hsn_code || '5208',
        item.category_name || '',
        item.unit || 'Pieces',
        item.quantity,
        item.rate,
        item.discount_type || 'flat',
        item.discount_value || 0,
        item.discountAmount,
        item.taxableAmount,
        item.gstRate,
        isInterState ? 1 : 0,
        item.cgstRate,
        item.cgstAmount,
        item.sgstRate,
        item.sgstAmount,
        item.igstRate,
        item.igstAmount,
        item.totalTax,
        item.finalAmount
      );

      // Decrement inventory if linked to a product
      if (item.product_id) {
        const prod = db.prepare('SELECT stock_quantity, name, unit FROM products WHERE id = ?').get(item.product_id);
        if (prod) {
          const qtyBefore = prod.stock_quantity;
          const qtyAfter = Math.round((qtyBefore - item.quantity) * 100) / 100;
          updateProductStock.run(item.quantity, item.product_id);
          insertTxn.run(
            item.product_id,
            prod.name,
            -item.quantity,
            qtyBefore,
            qtyAfter,
            prod.unit,
            finalInvoiceNumber,
            `Sale on invoice ${finalInvoiceNumber}`,
            req.user.id
          );
        }
      }
    }

    // Insert Payment Records
    const insertPayment = db.prepare(`
      INSERT INTO payments (invoice_id, customer_id, payment_date, payment_method, amount, reference_number, notes, received_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    if (split_payments && Array.isArray(split_payments) && split_payments.length > 0) {
      for (const sp of split_payments) {
        const amt = parseFloat(sp.amount) || 0;
        if (amt > 0) {
          insertPayment.run(
            createdInvoiceId,
            resolvedCustomerId,
            invoiceDate,
            sp.method || payment_method,
            amt,
            sp.reference || null,
            `Split payment for ${finalInvoiceNumber}`,
            req.user.id
          );
        }
      }
    } else if (totals.amountPaid > 0) {
      insertPayment.run(
        createdInvoiceId,
        resolvedCustomerId,
        invoiceDate,
        payment_method,
        totals.amountPaid,
        null,
        `Payment for ${finalInvoiceNumber}`,
        req.user.id
      );
    }

    // Update customer stats
    if (resolvedCustomerId) {
      db.prepare(`
        UPDATE customers
        SET total_purchases = total_purchases + ?,
            total_bills = total_bills + 1,
            outstanding_balance = outstanding_balance + ?,
            last_purchase_date = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(totals.grandTotal, totals.balanceDue, invoiceDate, resolvedCustomerId);
    }
  });

  invoiceTransaction();

  logAudit(req.user.id, req.user.full_name, 'INVOICE_CREATE', 'invoices', createdInvoiceId, `Generated invoice ${finalInvoiceNumber} for ₹${totals.grandTotal} (${totals.processedItems.length} items)`);

  // Fetch full generated invoice for instant printing
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(createdInvoiceId);
  const itemsList = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(createdInvoiceId);
  const paymentsList = db.prepare('SELECT * FROM payments WHERE invoice_id = ?').all(createdInvoiceId);

  res.status(201).json({
    ...invoice,
    items: itemsList,
    payments: paymentsList,
    shop,
    amount_in_words: numberToWordsINR(invoice.grand_total)
  });
});

module.exports = router;
