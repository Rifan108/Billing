const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

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

