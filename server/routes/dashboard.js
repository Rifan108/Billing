const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/metrics', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const currentMonthStr = today.slice(0, 7); // 'YYYY-MM'
  const currentYear = new Date().getFullYear();

  // 1. Today's stats
  const todayStats = db.prepare(`
    SELECT
      count(*) as today_invoices,
      coalesce(sum(grand_total), 0) as today_sales,
      coalesce(sum(total_tax_amount), 0) as today_gst,
      coalesce(sum(total_cgst), 0) as today_cgst,
      coalesce(sum(total_sgst), 0) as today_sgst,
      coalesce(sum(total_igst), 0) as today_igst,
      coalesce(sum(total_product_discount + total_bill_discount), 0) as today_discounts,
      coalesce(sum(total_items_count), 0) as today_items_count,
      coalesce(avg(grand_total), 0) as today_avg_bill
    FROM invoices
    WHERE invoice_date = ? AND status != 'cancelled'
  `).get(today);

  // 2. Yesterday's stats for comparison
  const yesterdayStats = db.prepare(`
    SELECT
      count(*) as invoices,
      coalesce(sum(grand_total), 0) as sales
    FROM invoices
    WHERE invoice_date = ? AND status != 'cancelled'
  `).get(yesterday);

  // 3. Outstanding Payments across all customers
  const outstandingStats = db.prepare(`
    SELECT
      coalesce(sum(outstanding_balance), 0) as total_outstanding,
      count(case when outstanding_balance > 0 then 1 end) as customers_with_dues
    FROM customers
  `).get();

  // 4. Total Inventory Value (at cost and at retail selling price)
  const inventoryStats = db.prepare(`
    SELECT
      count(*) as total_active_products,
      coalesce(sum(stock_quantity), 0) as total_stock_units,
      coalesce(sum(stock_quantity * purchase_price), 0) as inventory_cost_value,
      coalesce(sum(stock_quantity * selling_price), 0) as inventory_retail_value,
      count(case when stock_quantity <= 0 then 1 end) as out_of_stock_count,
      count(case when stock_quantity > 0 and stock_quantity <= min_stock_alert then 1 end) as low_stock_count
    FROM products
    WHERE status = 'active'
  `).get();

  // 5. Daily Sales Overview (last 14 days)
  const dailySales = db.prepare(`
    SELECT
      invoice_date as date,
      coalesce(sum(grand_total), 0) as sales,
      coalesce(sum(total_tax_amount), 0) as gst,
      count(*) as invoices
    FROM invoices
    WHERE status != 'cancelled' AND invoice_date >= date('now', '-14 days')
    GROUP BY invoice_date
    ORDER BY invoice_date ASC
  `).all();

  // 6. Monthly Revenue (Current Year all months)
  const monthlyRevenue = db.prepare(`
    SELECT
      strftime('%Y-%m', invoice_date) as month,
      coalesce(sum(grand_total), 0) as sales,
      coalesce(sum(total_tax_amount), 0) as gst,
      count(*) as invoices
    FROM invoices
    WHERE status != 'cancelled' AND strftime('%Y', invoice_date) = ?
    GROUP BY strftime('%Y-%m', invoice_date)
    ORDER BY month ASC
  `).all(String(currentYear));

  // 7. Yearly Revenue Comparison
  const yearlyRevenue = db.prepare(`
    SELECT
      strftime('%Y', invoice_date) as year,
      coalesce(sum(grand_total), 0) as sales,
      coalesce(sum(total_tax_amount), 0) as gst,
      count(*) as invoices
    FROM invoices
    WHERE status != 'cancelled'
    GROUP BY strftime('%Y', invoice_date)
    ORDER BY year ASC
  `).all();

  // 8. Payment Method Distribution
  const paymentMethods = db.prepare(`
    SELECT
      payment_method,
      coalesce(sum(amount), 0) as total_amount,
      count(*) as count
    FROM payments
    GROUP BY payment_method
    ORDER BY total_amount DESC
  `).all();

  // 9. Best-Selling Products (Top 8)
  const topProducts = db.prepare(`
    SELECT
      ii.product_name,
      ii.category_name,
      coalesce(sum(ii.quantity), 0) as total_qty_sold,
      coalesce(sum(ii.final_amount), 0) as total_revenue,
      ii.unit
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE i.status != 'cancelled'
    GROUP BY ii.product_name
    ORDER BY total_revenue DESC
    LIMIT 8
  `).all();

  // 10. Sales by Category
  const categorySales = db.prepare(`
    SELECT
      coalesce(ii.category_name, 'Other') as category_name,
      coalesce(sum(ii.final_amount), 0) as total_sales,
      coalesce(sum(ii.quantity), 0) as total_qty
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE i.status != 'cancelled'
    GROUP BY ii.category_name
    ORDER BY total_sales DESC
  `).all();

  // 11. Recent 5 Invoices
  const recentInvoices = db.prepare(`
    SELECT id, invoice_number, invoice_date, invoice_time, customer_name, grand_total, payment_method, payment_status, status
    FROM invoices
    ORDER BY id DESC
    LIMIT 5
  `).all();

  res.json({
    today: todayStats,
    yesterday: yesterdayStats,
    outstanding: outstandingStats,
    inventory: inventoryStats,
    daily_sales: dailySales,
    monthly_revenue: monthlyRevenue,
    yearly_revenue: yearlyRevenue,
    payment_methods: paymentMethods,
    top_products: topProducts,
    category_sales: categorySales,
    recent_invoices: recentInvoices
  });
});

module.exports = router;

