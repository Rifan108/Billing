const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

// Get expenses with filtering
router.get('/', (req, res) => {
  const { category, start_date, end_date, month, year } = req.query;

  let query = `
    SELECT e.*, u.full_name as created_by_name
    FROM expenses e
    LEFT JOIN users u ON e.created_by_user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (category) {
    query += ` AND e.category = ?`;
    params.push(category);
  }

  if (start_date && end_date) {
    query += ` AND e.expense_date BETWEEN ? AND ?`;
    params.push(start_date, end_date);
  } else if (month) {
    query += ` AND e.expense_date LIKE ?`;
    params.push(`${month}%`);
  } else if (year) {
    query += ` AND e.expense_date LIKE ?`;
    params.push(`${year}%`);
  }

  query += ` ORDER BY e.expense_date DESC, e.id DESC`;

  const expenses = db.prepare(query).all(...params);

  // Category breakdown
  let catQuery = `SELECT category, coalesce(sum(amount), 0) as total, count(*) as count FROM expenses WHERE 1=1`;
  const catParams = [];
  if (start_date && end_date) {
    catQuery += ` AND expense_date BETWEEN ? AND ?`;
    catParams.push(start_date, end_date);
  } else if (month) {
    catQuery += ` AND expense_date LIKE ?`;
    catParams.push(`${month}%`);
  }
  catQuery += ` GROUP BY category ORDER BY total DESC`;

  const categoryBreakdown = db.prepare(catQuery).all(...catParams);
  const totalAmount = categoryBreakdown.reduce((sum, c) => sum + c.total, 0);

  res.json({
    expenses,
    category_breakdown: categoryBreakdown,
    total_amount: Math.round(totalAmount * 100) / 100
  });
});

// Profit & Loss analysis combining Sales, COGS, and Expenses
router.get('/pnl', (req, res) => {
  const { start_date, end_date, month, year } = req.query;

  let dateFilter = '';
  let expFilter = '';
  const params = [];
  const expParams = [];

  if (start_date && end_date) {
    dateFilter = ' AND i.invoice_date BETWEEN ? AND ?';
    expFilter = ' AND expense_date BETWEEN ? AND ?';
    params.push(start_date, end_date);
    expParams.push(start_date, end_date);
  } else if (month) {
    dateFilter = ' AND i.invoice_date LIKE ?';
    expFilter = ' AND expense_date LIKE ?';
    params.push(`${month}%`);
    expParams.push(`${month}%`);
  } else if (year) {
    dateFilter = ' AND i.invoice_date LIKE ?';
    expFilter = ' AND expense_date LIKE ?';
    params.push(`${year}%`);
    expParams.push(`${year}%`);
  }

  // 1. Total Invoiced Sales & GST
  const salesData = db.prepare(`
    SELECT
      coalesce(sum(i.grand_total), 0) as gross_revenue,
      coalesce(sum(i.total_taxable_amount), 0) as net_sales_excl_tax,
      coalesce(sum(i.total_tax_amount), 0) as gst_collected,
      coalesce(sum(i.total_product_discount + i.total_bill_discount), 0) as total_discounts
    FROM invoices i
    WHERE i.status != 'cancelled' ${dateFilter}
  `).get(...params);

  // 2. Cost of Goods Sold (COGS) based on purchase_price * sold quantity
  const cogsData = db.prepare(`
    SELECT
      coalesce(sum(ii.quantity * coalesce(p.purchase_price, 0)), 0) as total_cogs
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE i.status != 'cancelled' ${dateFilter}
  `).get(...params);

  // 3. Operating Expenses
  const expData = db.prepare(`
    SELECT
      coalesce(sum(amount), 0) as total_operating_expenses
    FROM expenses
    WHERE 1=1 ${expFilter}
  `).get(...expParams);

  const grossProfit = Math.round((salesData.net_sales_excl_tax - cogsData.total_cogs) * 100) / 100;
  const netOperatingProfit = Math.round((grossProfit - expData.total_operating_expenses) * 100) / 100;
  const profitMarginPercent = salesData.net_sales_excl_tax > 0
    ? Math.round((netOperatingProfit / salesData.net_sales_excl_tax) * 10000) / 100
    : 0;

  res.json({
    gross_revenue: salesData.gross_revenue,
    net_sales_excl_tax: salesData.net_sales_excl_tax,
    gst_collected: salesData.gst_collected,
    total_discounts: salesData.total_discounts,
    cogs: cogsData.total_cogs,
    gross_profit: grossProfit,
    operating_expenses: expData.total_operating_expenses,
    net_operating_profit: netOperatingProfit,
    profit_margin_percent: profitMarginPercent
  });
});

// Add expense
router.post('/', requireAuth, (req, res) => {
  const { category, title, amount, expense_date, payment_method, receipt_number, notes } = req.body;

  if (!category || !title || !amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Please specify category, title, and valid positive amount' });
  }

  const today = new Date().toISOString().split('T')[0];
  const dateUsed = expense_date || today;

  const result = db.prepare(`
    INSERT INTO expenses (category, title, amount, expense_date, payment_method, receipt_number, notes, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    category,
    title.trim(),
    parseFloat(amount),
    dateUsed,
    payment_method || 'cash',
    receipt_number ? receipt_number.trim() : null,
    notes ? notes.trim() : null,
    req.user.id
  );

  logAudit(req.user.id, req.user.full_name, 'EXPENSE_CREATE', 'expenses', result.lastInsertRowid, `Recorded expense of ₹${amount} under ${category}: ${title}`);

  const created = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// Delete expense
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!exp) {
    return res.status(404).json({ error: 'Expense not found' });
  }

  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  logAudit(req.user.id, req.user.full_name, 'EXPENSE_DELETE', 'expenses', id, `Deleted expense: ${exp.title} (₹${exp.amount})`);

  res.json({ message: 'Expense deleted successfully' });
});

module.exports = router;

