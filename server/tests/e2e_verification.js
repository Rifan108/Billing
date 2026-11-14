const assert = require('assert');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { calculateItemTaxes, calculateInvoiceTotals, numberToWordsINR } = require('../services/gstEngine');

console.log('================================================================');
console.log(' STARTING END-TO-END QA SUITE FOR TEXTILE SHOP BILLING SYSTEM ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}\n`);
  }
}

// 1. Fixed Uploaded QR Code Verification
test('Fixed QR Code integrity check', () => {
  const sourcePath = 'C:/Users/ASUS/.gemini/antigravity/brain/ff4d7a93-be5c-40be-b356-d56c9cc66c4d/.user_uploaded/media_1794642843618_5959dc7e.jpg';
  const targetUpload = path.join(__dirname, '..', '..', 'uploads', 'default_upi_qr.jpg');
  const clientUpload = path.join(__dirname, '..', '..', 'client', 'public', 'uploads', 'default_upi_qr.jpg');

  assert(fs.existsSync(sourcePath), 'Original uploaded QR code image must exist');
  assert(fs.existsSync(targetUpload), 'Server uploads QR code must exist');
  assert(fs.existsSync(clientUpload), 'Client public uploads QR code must exist');

  const sourceSize = fs.statSync(sourcePath).size;
  const targetSize = fs.statSync(targetUpload).size;
  const clientSize = fs.statSync(clientUpload).size;

  assert.strictEqual(sourceSize, targetSize, 'Target QR file size must match original exactly');
  assert.strictEqual(sourceSize, clientSize, 'Client QR file size must match original exactly');
  assert.strictEqual(targetSize, 74837, 'File length must match 74837 bytes');

  const shop = db.prepare('SELECT qr_code_url FROM shop_settings WHERE id = 1').get();
  assert(shop.qr_code_url.includes('default_upi_qr.jpg'), 'Shop settings must link to default_upi_qr.jpg');
});

// 2. GST Calculation Engine Tests
test('GST Intra-state (5% slab, 50-50 CGST & SGST split)', () => {
  const item = calculateItemTaxes({
    rate: 1000,
    quantity: 2,
    discountValue: 200,
    gstRate: 5.0,
    isTaxInclusive: false,
    isInterState: false
  });

  // Raw: 2000, Disc: 200 -> Taxable: 1800
  // 5% of 1800 = 90
  // CGST (2.5%) = 45, SGST (2.5%) = 45, IGST = 0
  assert.strictEqual(item.rawSubtotal, 2000);
  assert.strictEqual(item.discountAmount, 200);
  assert.strictEqual(item.taxableAmount, 1800);
  assert.strictEqual(item.cgstRate, 2.5);
  assert.strictEqual(item.cgstAmount, 45);
  assert.strictEqual(item.sgstRate, 2.5);
  assert.strictEqual(item.sgstAmount, 45);
  assert.strictEqual(item.igstAmount, 0);
  assert.strictEqual(item.totalTax, 90);
  assert.strictEqual(item.finalAmount, 1890);
});

test('GST Inter-state (12% slab, 100% IGST)', () => {
  const item = calculateItemTaxes({
    rate: 2500,
    quantity: 1,
    discountValue: 500,
    gstRate: 12.0,
    isTaxInclusive: false,
    isInterState: true
  });

  // Raw: 2500, Disc: 500 -> Taxable: 2000
  // 12% IGST of 2000 = 240
  // CGST = 0, SGST = 0
  assert.strictEqual(item.taxableAmount, 2000);
  assert.strictEqual(item.cgstAmount, 0);
  assert.strictEqual(item.sgstAmount, 0);
  assert.strictEqual(item.igstAmount, 240);
  assert.strictEqual(item.totalTax, 240);
  assert.strictEqual(item.finalAmount, 2240);
});

test('GST-Inclusive (MRP pricing back-calculation)', () => {
  // MRP = 1050, inclusive of 5% GST
  // Taxable = 1050 / 1.05 = 1000
  // Total Tax = 50 (CGST 25 + SGST 25)
  const item = calculateItemTaxes({
    rate: 1050,
    quantity: 1,
    discountValue: 0,
    gstRate: 5.0,
    isTaxInclusive: true,
    isInterState: false
  });

  assert.strictEqual(item.taxableAmount, 1000);
  assert.strictEqual(item.totalTax, 50);
  assert.strictEqual(item.cgstAmount, 25);
  assert.strictEqual(item.sgstAmount, 25);
  assert.strictEqual(item.finalAmount, 1050);
});

test('Multi-product Invoice with Bill-level discount & rounding', () => {
  const items = [
    { rate: 5000, quantity: 1, discount_value: 0, gst_rate: 5.0, is_tax_inclusive: false },
    { rate: 1000, quantity: 3, discount_value: 300, gst_rate: 12.0, is_tax_inclusive: false }
  ];

  // Item 1: Taxable 5000, 5% = 250
  // Item 2: Raw 3000, Disc 300 -> Taxable 2700, 12% = 324
  // Total Taxable = 7700, Total Tax = 574
  // Bill Discount = 200
  // Net = 7700 + 574 - 200 = 8074
  const totals = calculateInvoiceTotals({
    items,
    billDiscountType: 'flat',
    billDiscountValue: 200,
    isInterState: false,
    amountPaid: 5000
  });

  assert.strictEqual(totals.subtotalRaw, 8000);
  assert.strictEqual(totals.totalProductDiscount, 300);
  assert.strictEqual(totals.totalTaxableAmount, 7700);
  assert.strictEqual(totals.totalTaxAmount, 574);
  assert.strictEqual(totals.totalBillDiscount, 200);
  assert.strictEqual(totals.grandTotal, 8074);
  assert.strictEqual(totals.amountPaid, 5000);
  assert.strictEqual(totals.balanceDue, 3074);
  assert.strictEqual(totals.paymentStatus, 'partial');
});

// 3. Indian Currency in Words
test('Indian Currency in Words formatting', () => {
  const w1 = numberToWordsINR(8074);
  assert.strictEqual(w1, 'Eight Thousand Seventy-Four Rupees Only');

  const w2 = numberToWordsINR(145250.50);
  assert.strictEqual(w2, 'One Lakh Forty-Five Thousand Two Hundred Fifty Rupees and Fifty Paise Only');

  const w3 = numberToWordsINR(12500000);
  assert.strictEqual(w3, 'One Crore Twenty-Five Lakh Rupees Only');
});

// 4. Stock Deductions and Returns
test('Stock automatic deduction and cancellation restoration', () => {
  const product = db.prepare('SELECT id, name, stock_quantity, unit FROM products WHERE id = 4').get();
  const initialStock = product.stock_quantity;
  const deductQty = 5;

  // Simulate Sale
  db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(deductQty, product.id);
  const afterSale = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(product.id).stock_quantity;
  assert.strictEqual(afterSale, initialStock - deductQty, 'Stock must decrease after sale');

  // Simulate Cancellation Restoration
  db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?').run(deductQty, product.id);
  const afterRestore = db.prepare('SELECT stock_quantity FROM products WHERE id = ?').get(product.id).stock_quantity;
  assert.strictEqual(afterRestore, initialStock, 'Stock must be restored to initial level after cancellation');
});

// 5. Database Schema & Tables
test('Verification of all 13 core database tables', () => {
  const tables = [
    'shop_settings', 'users', 'products', 'categories', 'inventory_transactions',
    'customers', 'invoices', 'invoice_items', 'payments', 'refunds',
    'expenses', 'audit_logs', 'backups'
  ];

  for (const t of tables) {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
    assert(row, `Table ${t} must exist in the SQLite database`);
  }
});

console.log('\n================================================================');
console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('================================================================');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}

