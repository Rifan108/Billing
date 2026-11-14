const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const db = require('../database');
const { requireAuth } = require('../middleware/auth');

// Helper to get Financial Year start and end dates
function getFinancialYearDates(fyString) {
  // e.g. "2026-2027" or "2026-27"
  const startYear = parseInt(fyString.split('-')[0], 10);
  const startDate = `${startYear}-04-01`;
  const endDate = `${startYear + 1}-03-31`;
  return { startDate, endDate };
}

// GST Summary & History endpoint
router.get('/reports', (req, res) => {
  const {
    period,
    start_date,
    end_date,
    month,
    year,
    financial_year
  } = req.query;

  let dateFilter = '';
  const params = [];

  if (financial_year) {
    const { startDate, endDate } = getFinancialYearDates(financial_year);
    dateFilter = ' AND i.invoice_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (start_date && end_date) {
    dateFilter = ' AND i.invoice_date BETWEEN ? AND ?';
    params.push(start_date, end_date);
  } else if (month) {
    dateFilter = ' AND i.invoice_date LIKE ?';
    params.push(`${month}%`);
  } else if (year) {
    dateFilter = ' AND i.invoice_date LIKE ?';
    params.push(`${year}%`);
  } else if (period === 'today') {
    const today = new Date().toISOString().split('T')[0];
    dateFilter = ' AND i.invoice_date = ?';
    params.push(today);
  } else if (period === 'weekly') {
    dateFilter = " AND i.invoice_date >= date('now', '-7 days')";
  } else if (period === 'monthly') {
    const curMonth = new Date().toISOString().slice(0, 7);
    dateFilter = ' AND i.invoice_date LIKE ?';
    params.push(`${curMonth}%`);
  } else if (period === 'yearly') {
    const curYear = new Date().getFullYear();
    dateFilter = ' AND i.invoice_date LIKE ?';
    params.push(`${curYear}%`);
  }

  // Active invoices totals (excluding cancelled)
  const totals = db.prepare(`
    SELECT
      count(*) as invoice_count,
      coalesce(sum(subtotal_raw), 0) as total_gross_sales,
      coalesce(sum(total_product_discount + total_bill_discount), 0) as total_discounts,
      coalesce(sum(total_taxable_amount), 0) as total_taxable_sales,
      coalesce(sum(total_cgst), 0) as total_cgst,
      coalesce(sum(total_sgst), 0) as total_sgst,
      coalesce(sum(total_igst), 0) as total_igst,
      coalesce(sum(total_tax_amount), 0) as total_gst,
      coalesce(sum(grand_total), 0) as total_invoice_amount
    FROM invoices i
    WHERE i.status != 'cancelled' ${dateFilter}
  `).get(...params);

  // Subtract refunds occurring in this period
  let refundFilter = '';
  const refundParams = [];
  if (financial_year) {
    const { startDate, endDate } = getFinancialYearDates(financial_year);
    refundFilter = ' WHERE refund_date BETWEEN ? AND ?';
    refundParams.push(startDate, endDate);
  } else if (start_date && end_date) {
    refundFilter = ' WHERE refund_date BETWEEN ? AND ?';
    refundParams.push(start_date, end_date);
  } else if (month) {
    refundFilter = ' WHERE refund_date LIKE ?';
    refundParams.push(`${month}%`);
  } else if (year) {
    refundFilter = ' WHERE refund_date LIKE ?';
    refundParams.push(`${year}%`);
  } else if (period === 'today') {
    const today = new Date().toISOString().split('T')[0];
    refundFilter = ' WHERE refund_date = ?';
    refundParams.push(today);
  } else if (period === 'weekly') {
    refundFilter = " WHERE refund_date >= date('now', '-7 days')";
  } else if (period === 'monthly') {
    const curMonth = new Date().toISOString().slice(0, 7);
    refundFilter = ' WHERE refund_date LIKE ?';
    refundParams.push(`${curMonth}%`);
  } else if (period === 'yearly') {
    const curYear = new Date().getFullYear();
    refundFilter = ' WHERE refund_date LIKE ?';
    refundParams.push(`${curYear}%`);
  }

  const refundTotals = db.prepare(`
    SELECT
      count(*) as refund_count,
      coalesce(sum(taxable_refund_amount), 0) as refund_taxable,
      coalesce(sum(cgst_refund), 0) as refund_cgst,
      coalesce(sum(sgst_refund), 0) as refund_sgst,
      coalesce(sum(igst_refund), 0) as refund_igst,
      coalesce(sum(total_tax_refund), 0) as refund_tax,
      coalesce(sum(total_refund_amount), 0) as refund_total
    FROM refunds ${refundFilter}
  `).get(...refundParams);

  // Net Tax Calculations
  const netTaxable = Math.round((totals.total_taxable_sales - refundTotals.refund_taxable) * 100) / 100;
  const netCgst = Math.round((totals.total_cgst - refundTotals.refund_cgst) * 100) / 100;
  const netSgst = Math.round((totals.total_sgst - refundTotals.refund_sgst) * 100) / 100;
  const netIgst = Math.round((totals.total_igst - refundTotals.refund_igst) * 100) / 100;
  const netGst = Math.round((totals.total_gst - refundTotals.refund_tax) * 100) / 100;
  const netSales = Math.round((totals.total_invoice_amount - refundTotals.refund_total) * 100) / 100;

  // Rate-wise GST Slab Breakdown (0%, 5%, 12%, 18%, 28%)
  const rateBreakdown = db.prepare(`
    SELECT
      ii.gst_rate,
      coalesce(sum(ii.taxable_amount), 0) as taxable_amount,
      coalesce(sum(ii.cgst_amount), 0) as cgst_amount,
      coalesce(sum(ii.sgst_amount), 0) as sgst_amount,
      coalesce(sum(ii.igst_amount), 0) as igst_amount,
      coalesce(sum(ii.total_tax), 0) as total_tax,
      coalesce(sum(ii.final_amount), 0) as total_amount
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE i.status != 'cancelled' ${dateFilter}
    GROUP BY ii.gst_rate
    ORDER BY ii.gst_rate ASC
  `).all(...params);

  // Product-wise / HSN-wise GST Breakdown
  const hsnBreakdown = db.prepare(`
    SELECT
      ii.hsn_code,
      coalesce(ii.category_name, 'Textiles') as category_name,
      ii.gst_rate,
      coalesce(sum(ii.quantity), 0) as total_quantity,
      coalesce(sum(ii.taxable_amount), 0) as taxable_amount,
      coalesce(sum(ii.cgst_amount), 0) as cgst_amount,
      coalesce(sum(ii.sgst_amount), 0) as sgst_amount,
      coalesce(sum(ii.igst_amount), 0) as igst_amount,
      coalesce(sum(ii.total_tax), 0) as total_tax,
      coalesce(sum(ii.final_amount), 0) as total_amount
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE i.status != 'cancelled' ${dateFilter}
    GROUP BY ii.hsn_code, ii.gst_rate
    ORDER BY total_amount DESC
  `).all(...params);

  // Time series for charts (Daily / Monthly)
  const timeSeries = db.prepare(`
    SELECT
      i.invoice_date as date_label,
      coalesce(sum(i.total_taxable_amount), 0) as taxable_amount,
      coalesce(sum(i.total_cgst), 0) as cgst,
      coalesce(sum(i.total_sgst), 0) as sgst,
      coalesce(sum(i.total_igst), 0) as igst,
      coalesce(sum(i.total_tax_amount), 0) as total_tax,
      coalesce(sum(i.grand_total), 0) as sales
    FROM invoices i
    WHERE i.status != 'cancelled' ${dateFilter}
    GROUP BY i.invoice_date
    ORDER BY i.invoice_date ASC
  `).all(...params);

  res.json({
    summary: {
      ...totals,
      net_taxable: netTaxable,
      net_cgst: netCgst,
      net_sgst: netSgst,
      net_igst: netIgst,
      net_gst: netGst,
      net_sales: netSales,
      refunds: refundTotals
    },
    rate_breakdown: rateBreakdown,
    hsn_breakdown: hsnBreakdown,
    time_series: timeSeries
  });
});

// Export GST Report as Excel or CSV
router.get('/export', (req, res) => {
  const { format = 'xlsx', start_date, end_date, financial_year } = req.query;

  let dateFilter = '';
  const params = [];
  if (financial_year) {
    const { startDate, endDate } = getFinancialYearDates(financial_year);
    dateFilter = ' AND i.invoice_date BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (start_date && end_date) {
    dateFilter = ' AND i.invoice_date BETWEEN ? AND ?';
    params.push(start_date, end_date);
  }

  // Invoice-level tax register
  const invoices = db.prepare(`
    SELECT
      i.invoice_number as "Invoice Number",
      i.invoice_date as "Invoice Date",
      i.customer_name as "Customer Name",
      i.customer_gstin as "Customer GSTIN",
      i.place_of_supply as "Place of Supply",
      CASE WHEN i.is_inter_state = 1 THEN 'Inter-State' ELSE 'Intra-State' END as "Supply Type",
      i.total_taxable_amount as "Taxable Value (₹)",
      i.total_cgst as "CGST (₹)",
      i.total_sgst as "SGST (₹)",
      i.total_igst as "IGST (₹)",
      i.total_tax_amount as "Total GST (₹)",
      i.round_off as "Round Off",
      i.grand_total as "Invoice Value (₹)",
      i.payment_status as "Payment Status",
      i.status as "Invoice Status"
    FROM invoices i
    WHERE 1=1 ${dateFilter}
    ORDER BY i.invoice_date ASC, i.id ASC
  `).all(...params);

  // HSN summary
  const hsnRows = db.prepare(`
    SELECT
      ii.hsn_code as "HSN Code",
      ii.category_name as "Category",
      ii.gst_rate as "GST Rate %",
      sum(ii.quantity) as "Total Qty",
      sum(ii.taxable_amount) as "Total Taxable (₹)",
      sum(ii.cgst_amount) as "CGST (₹)",
      sum(ii.sgst_amount) as "SGST (₹)",
      sum(ii.igst_amount) as "IGST (₹)",
      sum(ii.total_tax) as "Total GST (₹)",
      sum(ii.final_amount) as "Total Value (₹)"
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE i.status != 'cancelled' ${dateFilter}
    GROUP BY ii.hsn_code, ii.gst_rate
  `).all(...params);

  if (format === 'csv') {
    const ws = xlsx.utils.json_to_sheet(invoices);
    const csvData = xlsx.utils.sheet_to_csv(ws);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="GST_Sales_Register.csv"');
    return res.send(csvData);
  }

  // Excel (.xlsx) with multiple sheets (Sales Register + HSN Summary)
  const wb = xlsx.utils.book_new();
  const ws1 = xlsx.utils.json_to_sheet(invoices);
  const ws2 = xlsx.utils.json_to_sheet(hsnRows);

  xlsx.utils.book_append_sheet(wb, ws1, 'GST Sales Register');
  xlsx.utils.book_append_sheet(wb, ws2, 'HSN Wise Summary');

  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="GST_Report.xlsx"');
  res.send(buffer);
});

module.exports = router;

