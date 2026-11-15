const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

// Advanced Sales Analytics with Profit & Loss and Inventory performance
router.get('/advanced-analytics', (req, res) => {
  const { preset = 'monthly', start_date, end_date } = req.query;

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let rangeStart = start_date;
  let rangeEnd = end_date || today;

  if (preset === 'today') {
    rangeStart = today;
    rangeEnd = today;
  } else if (preset === 'yesterday') {
    rangeStart = yesterday;
    rangeEnd = yesterday;
  } else if (preset === 'weekly') {
    rangeStart = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    rangeEnd = today;
  } else if (preset === 'monthly') {
    rangeStart = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    rangeEnd = today;
  } else if (preset === 'yearly') {
    rangeStart = `${new Date().getFullYear()}-01-01`;
    rangeEnd = today;
  }

  // 1. Overall Sales Financials
  const salesSummary = db.prepare(`
    SELECT
      count(*) as total_invoices,
      coalesce(sum(grand_total), 0) as gross_sales,
      coalesce(sum(total_taxable_amount), 0) as taxable_sales,
      coalesce(sum(total_tax_amount), 0) as gst_collected,
      coalesce(sum(total_cgst), 0) as total_cgst,
      coalesce(sum(total_sgst), 0) as total_sgst,
      coalesce(sum(total_igst), 0) as total_igst,
      coalesce(sum(total_product_discount + total_bill_discount), 0) as total_discounts,
      coalesce(sum(amount_paid), 0) as total_collected,
      coalesce(sum(balance_due), 0) as pending_dues,
      coalesce(avg(grand_total), 0) as avg_invoice_value
    FROM invoices
    WHERE status != 'cancelled' AND invoice_date BETWEEN ? AND ?
  `).get(rangeStart, rangeEnd);

  // 2. Cost of Goods Sold & Gross Profit
  const cogsData = db.prepare(`
    SELECT
      coalesce(sum(ii.quantity * coalesce(v.purchase_price, p.purchase_price, 0)), 0) as total_cost,
      coalesce(sum(ii.final_amount), 0) as total_rev
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN product_variants v ON ii.variant_id = v.id
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE i.status != 'cancelled' AND i.invoice_date BETWEEN ? AND ?
  `).get(rangeStart, rangeEnd);

  const estimatedGrossProfit = Math.max(0, Math.round((cogsData.total_rev - cogsData.total_cost) * 100) / 100);

  // 3. Operating Expenses in this period
  const expensesData = db.prepare(`
    SELECT coalesce(sum(amount), 0) as total_expenses
    FROM expenses
    WHERE expense_date BETWEEN ? AND ?
  `).get(rangeStart, rangeEnd);

  const totalExpenses = expensesData.total_expenses;
  const estimatedNetProfit = Math.round((estimatedGrossProfit - totalExpenses) * 100) / 100;

  // 4. Customer Outstanding Balance (Global)
  const outstandingData = db.prepare('SELECT coalesce(sum(outstanding_balance), 0) as total_khata_outstanding FROM customers').get();

  // 5. Best-Selling Products
  const bestSellers = db.prepare(`
    SELECT
      ii.product_name,
      ii.unit,
      coalesce(sum(ii.quantity), 0) as qty_sold,
      coalesce(sum(ii.final_amount), 0) as revenue,
      coalesce(sum(ii.final_amount - (ii.quantity * coalesce(v.purchase_price, p.purchase_price, 0))), 0) as item_profit
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN product_variants v ON ii.variant_id = v.id
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE i.status != 'cancelled' AND i.invoice_date BETWEEN ? AND ?
    GROUP BY ii.product_name
    ORDER BY revenue DESC
    LIMIT 6
  `).all(rangeStart, rangeEnd);

  // 6. Slow-Moving Products (Products with 0 or least sales)
  const slowMovers = db.prepare(`
    SELECT
      p.id, p.name, p.sku, p.stock_quantity, p.unit, p.selling_price,
      coalesce(sum(ii.quantity), 0) as qty_sold_period
    FROM products p
    LEFT JOIN invoice_items ii ON ii.product_id = p.id
    LEFT JOIN invoices i ON ii.invoice_id = i.id AND i.status != 'cancelled' AND i.invoice_date BETWEEN ? AND ?
    WHERE p.status = 'active'
    GROUP BY p.id
    ORDER BY qty_sold_period ASC, p.stock_quantity DESC
    LIMIT 6
  `).all(rangeStart, rangeEnd);

  // 7. Top Categories
  const categoryBreakdown = db.prepare(`
    SELECT
      coalesce(ii.category_name, 'Other') as category_name,
      coalesce(sum(ii.final_amount), 0) as total_revenue,
      coalesce(sum(ii.quantity), 0) as total_units
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE i.status != 'cancelled' AND i.invoice_date BETWEEN ? AND ?
    GROUP BY ii.category_name
    ORDER BY total_revenue DESC
  `).all(rangeStart, rangeEnd);

  // 8. Payment Method Breakdown
  const paymentBreakdown = db.prepare(`
    SELECT
      payment_method,
      count(*) as invoice_count,
      coalesce(sum(amount_paid), 0) as total_paid,
      coalesce(sum(balance_due), 0) as total_credit
    FROM invoices
    WHERE status != 'cancelled' AND invoice_date BETWEEN ? AND ?
    GROUP BY payment_method
    ORDER BY total_paid DESC
  `).all(rangeStart, rangeEnd);

  // 9. Daily Sales Trends in Range
  const dailyTrends = db.prepare(`
    SELECT
      invoice_date as date,
      coalesce(sum(grand_total), 0) as sales,
      coalesce(sum(total_tax_amount), 0) as gst,
      count(*) as invoices
    FROM invoices
    WHERE status != 'cancelled' AND invoice_date BETWEEN ? AND ?
    GROUP BY invoice_date
    ORDER BY invoice_date ASC
  `).all(rangeStart, rangeEnd);

  const grossSales = salesSummary.gross_sales || 0;
  const totalCogs = cogsData.total_cost || 0;
  const grossProfit = estimatedGrossProfit;
  const grossMarginPct = grossSales > 0 ? Math.round((grossProfit / grossSales) * 1000) / 10 : 0;
  const netProfit = estimatedNetProfit;
  const netMarginPct = grossSales > 0 ? Math.round((netProfit / grossSales) * 1000) / 10 : 0;

  const kpiData = {
    gross_sales: grossSales,
    net_sales: salesSummary.taxable_sales || 0,
    total_discount: salesSummary.total_discounts || 0,
    total_tax: salesSummary.gst_collected || 0,
    cgst: salesSummary.total_cgst || 0,
    sgst: salesSummary.total_sgst || 0,
    igst: salesSummary.total_igst || 0,
    total_cogs: totalCogs,
    gross_profit: grossProfit,
    gross_margin_percent: grossMarginPct,
    total_expenses: totalExpenses,
    net_profit: netProfit,
    net_margin_percent: netMarginPct,
    active_khata_dues: outstandingData.total_khata_outstanding || 0,
    invoices_count: salesSummary.total_invoices || 0
  };

  res.json({
    date_range: { start_date: rangeStart, end_date: rangeEnd, preset },
    kpi: kpiData,
    overview: {
      ...salesSummary,
      cost_of_goods: totalCogs,
      gross_profit: grossProfit,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      customer_khata_outstanding: outstandingData.total_khata_outstanding
    },
    sales: salesSummary,
    cogs: totalCogs,
    gross_profit: grossProfit,
    net_profit: netProfit,
    best_sellers: bestSellers,
    slow_movers: slowMovers,
    categories: categoryBreakdown,
    payments: paymentBreakdown,
    payment_methods: paymentBreakdown,
    trends: dailyTrends,
    daily_trends: dailyTrends
  });
});

// Generic Sales & Analytical reports
router.get('/sales', (req, res) => {
  const { type = 'daily', start_date, end_date } = req.query;

  let query = '';
  const params = [];

  if (type === 'daily') {
    query = `
      SELECT
        invoice_date as period,
        count(*) as invoice_count,
        sum(total_items_count) as total_items,
        sum(total_taxable_amount) as taxable_amount,
        sum(total_tax_amount) as gst_collected,
        sum(total_product_discount + total_bill_discount) as total_discount,
        sum(grand_total) as total_sales,
        avg(grand_total) as avg_bill_value
      FROM invoices
      WHERE status != 'cancelled'
    `;
    if (start_date && end_date) {
      query += ` AND invoice_date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    } else {
      query += ` AND invoice_date >= date('now', '-30 days')`;
    }
    query += ` GROUP BY invoice_date ORDER BY invoice_date DESC`;
  } else if (type === 'monthly') {
    query = `
      SELECT
        strftime('%Y-%m', invoice_date) as period,
        count(*) as invoice_count,
        sum(total_items_count) as total_items,
        sum(total_taxable_amount) as taxable_amount,
        sum(total_tax_amount) as gst_collected,
        sum(total_product_discount + total_bill_discount) as total_discount,
        sum(grand_total) as total_sales,
        avg(grand_total) as avg_bill_value
      FROM invoices
      WHERE status != 'cancelled'
      GROUP BY strftime('%Y-%m', invoice_date)
      ORDER BY period DESC
    `;
  } else if (type === 'yearly') {
    query = `
      SELECT
        strftime('%Y', invoice_date) as period,
        count(*) as invoice_count,
        sum(total_items_count) as total_items,
        sum(total_taxable_amount) as taxable_amount,
        sum(total_tax_amount) as gst_collected,
        sum(total_product_discount + total_bill_discount) as total_discount,
        sum(grand_total) as total_sales,
        avg(grand_total) as avg_bill_value
      FROM invoices
      WHERE status != 'cancelled'
      GROUP BY strftime('%Y', invoice_date)
      ORDER BY period DESC
    `;
  } else if (type === 'product_wise') {
    query = `
      SELECT
        ii.product_name,
        ii.category_name,
        ii.hsn_code,
        ii.unit,
        count(distinct i.id) as orders_count,
        sum(ii.quantity) as total_quantity_sold,
        sum(ii.taxable_amount) as total_taxable,
        sum(ii.total_tax) as total_tax,
        sum(ii.final_amount) as total_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.status != 'cancelled'
    `;
    if (start_date && end_date) {
      query += ` AND i.invoice_date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    }
    query += ` GROUP BY ii.product_name ORDER BY total_revenue DESC`;
  } else if (type === 'category_wise') {
    query = `
      SELECT
        coalesce(ii.category_name, 'Uncategorized') as category_name,
        sum(ii.quantity) as total_quantity_sold,
        sum(ii.taxable_amount) as total_taxable,
        sum(ii.total_tax) as total_tax,
        sum(ii.final_amount) as total_revenue
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.status != 'cancelled'
    `;
    if (start_date && end_date) {
      query += ` AND i.invoice_date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    }
    query += ` GROUP BY ii.category_name ORDER BY total_revenue DESC`;
  } else if (type === 'customer_wise') {
    query = `
      SELECT
        c.name as customer_name,
        c.phone as customer_phone,
        c.city,
        c.state,
        count(i.id) as invoice_count,
        sum(i.grand_total) as total_billed,
        sum(i.amount_paid) as total_paid,
        c.outstanding_balance
      FROM customers c
      LEFT JOIN invoices i ON i.customer_id = c.id AND i.status != 'cancelled'
      GROUP BY c.id
      ORDER BY total_billed DESC
    `;
  }

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// Export report as Excel (.xlsx) or CSV
router.get('/export', (req, res) => {
  const { type = 'daily', format = 'xlsx', start_date, end_date } = req.query;

  let query = '';
  const params = [];
  let sheetName = 'Report';

  if (type === 'product_wise') {
    sheetName = 'Product Wise Sales';
    query = `
      SELECT
        ii.product_name as "Product Name",
        ii.category_name as "Category",
        ii.hsn_code as "HSN Code",
        ii.unit as "Unit",
        sum(ii.quantity) as "Total Qty Sold",
        sum(ii.taxable_amount) as "Taxable Sales (₹)",
        sum(ii.total_tax) as "GST Collected (₹)",
        sum(ii.final_amount) as "Total Revenue (₹)"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.status != 'cancelled'
      GROUP BY ii.product_name
      ORDER BY sum(ii.final_amount) DESC
    `;
  } else if (type === 'category_wise') {
    sheetName = 'Category Wise Sales';
    query = `
      SELECT
        coalesce(ii.category_name, 'Other') as "Category",
        sum(ii.quantity) as "Total Units Sold",
        sum(ii.taxable_amount) as "Taxable Sales (₹)",
        sum(ii.total_tax) as "GST Collected (₹)",
        sum(ii.final_amount) as "Total Revenue (₹)"
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.status != 'cancelled'
      GROUP BY ii.category_name
      ORDER BY sum(ii.final_amount) DESC
    `;
  } else {
    sheetName = 'Daily Sales Summary';
    query = `
      SELECT
        invoice_date as "Date",
        count(*) as "Total Invoices",
        sum(total_items_count) as "Total Items",
        sum(total_taxable_amount) as "Taxable Amount (₹)",
        sum(total_tax_amount) as "GST Collected (₹)",
        sum(total_product_discount + total_bill_discount) as "Discounts Given (₹)",
        sum(grand_total) as "Gross Sales (₹)"
      FROM invoices
      WHERE status != 'cancelled'
      GROUP BY invoice_date
      ORDER BY invoice_date DESC
    `;
  }

  const rows = db.prepare(query).all(...params);

  if (format === 'csv') {
    const ws = xlsx.utils.json_to_sheet(rows);
    const csv = xlsx.utils.sheet_to_csv(ws);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${sheetName.replace(/\s+/g, '_')}.csv"`);
    return res.send(csv);
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${sheetName.replace(/\s+/g, '_')}.xlsx"`);
  res.send(buffer);
});

module.exports = router;

