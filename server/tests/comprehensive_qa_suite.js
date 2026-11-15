const assert = require('assert');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5000/api';

console.log('================================================================');
console.log('   FULL APPLICATION AUTOMATED QA TEST SUITE & BUG VERIFICATION  ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = [];

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
    failedTests.push({ name, error: err.message });
  }
}

async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  let adminToken = '';
  let testProductId = null;
  let testVariantId = null;
  let testCustomerId = null;
  let testSupplierId = null;
  let testInvoiceId = null;
  let testInvoiceNumber = '';

  // --- MODULE 1: AUTHENTICATION & ACCESS CONTROL ---
  await runTest('Auth: Rejects invalid credentials with 401', async () => {
    const res = await apiRequest('/auth/login', 'POST', { username: 'admin', password: 'wrongpassword' });
    assert.strictEqual(res.status, 401, 'Must return 401 for wrong password');
  });

  await runTest('Auth: Successful admin login returns valid JWT token', async () => {
    const res = await apiRequest('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    assert.strictEqual(res.status, 200);
    assert(res.data.token, 'Token must be present in response');
    assert.strictEqual(res.data.user.username, 'admin');
    assert.strictEqual(res.data.user.role, 'admin');
    adminToken = res.data.token;
  });

  await runTest('Auth: Protected route rejects requests without Bearer token', async () => {
    const res = await apiRequest('/auth/users', 'GET', null, null);
    assert.strictEqual(res.status, 401, 'Protected route must reject unauthenticated requests');
  });

  // --- MODULE 2: DASHBOARD & METRICS ---
  await runTest('Dashboard: Returns all KPIs and metrics without error', async () => {
    const res = await apiRequest('/dashboard/metrics', 'GET', null, adminToken);
    assert.strictEqual(res.status, 200);
    const d = res.data;
    assert('today' in d, 'Must contain today metrics');
    assert('inventory' in d, 'Must contain inventory metrics');
    assert('daily_sales' in d, 'Must contain daily_sales array');
    assert('monthly_revenue' in d, 'Must contain monthly_revenue array');
    assert('top_products' in d, 'Must contain top_products');
    assert('recent_invoices' in d, 'Must contain recent_invoices');
    assert(typeof d.inventory.inventory_cost_value === 'number', 'Inventory cost must be a valid number');
    assert(typeof d.inventory.total_stock_units === 'number', 'Total stock units must be a valid number');
  });

  // --- MODULE 3: PRODUCTS & VARIANTS ---
  await runTest('Products: Create new textile product', async () => {
    const sku = `TEST-PROD-${Date.now().toString().slice(-5)}`;
    const res = await apiRequest('/products', 'POST', {
      name: 'QA Automation Test Silk Fabric',
      sku,
      hsn_code: '5208',
      unit: 'Meters',
      purchase_price: 300,
      selling_price: 650,
      gst_rate: 5.0,
      stock_quantity: 100,
      min_stock_alert: 10,
      category_id: 1
    }, adminToken);

    assert.strictEqual(res.status, 201, 'Should create product');
    assert(res.data.id, 'Should have product id');
    testProductId = res.data.id;
  });

  await runTest('Products: Reject duplicate SKU on product creation', async () => {
    const prod = (await apiRequest(`/products/${testProductId}`, 'GET', null, adminToken)).data;
    const res = await apiRequest('/products', 'POST', {
      name: 'Duplicate SKU Item',
      sku: prod.sku,
      hsn_code: '5208',
      unit: 'Pieces',
      purchase_price: 100,
      selling_price: 200,
      gst_rate: 5.0
    }, adminToken);
    assert.strictEqual(res.status, 400, 'Must reject duplicate SKU');
  });

  await runTest('Variants: Create product variant with automatic barcode', async () => {
    const varSku = `VAR-${Date.now().toString().slice(-5)}`;
    const res = await apiRequest(`/products/${testProductId}/variants`, 'POST', {
      variant_name: 'Royal Blue / 6.2m',
      color: 'Royal Blue',
      size: '6.2m',
      sku: varSku,
      purchase_price: 320,
      selling_price: 700,
      gst_rate: 5.0,
      stock_quantity: 25,
      min_stock_alert: 5
    }, adminToken);

    assert.strictEqual(res.status, 201, 'Should create variant');
    assert(res.data.id, 'Variant should have id');
    assert(res.data.barcode, 'Variant should have auto-generated barcode');
    testVariantId = res.data.id;
  });

  await runTest('Barcode: Service generates valid Code-128 SVG', async () => {
    const res = await fetch(`${BASE_URL}/products/barcode/svg?code=890123456789&width=2&height=40`);
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert(contentType && contentType.includes('image/svg+xml'), 'Must return image/svg+xml');
    const svgText = await res.text();
    assert(svgText.includes('<svg') && svgText.includes('</svg>'), 'Must contain SVG tags');
  });

  // --- MODULE 4: CUSTOMERS & KHATA LEDGER ---
  await runTest('Customers: Register new customer with mobile number', async () => {
    const phone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const res = await apiRequest('/customers', 'POST', {
      name: 'Priya Sundaram',
      phone,
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      state_code: '33'
    }, adminToken);

    assert.strictEqual(res.status, 201);
    assert(res.data.id, 'Customer should have id');
    testCustomerId = res.data.id;
  });

  await runTest('Customers: Reject duplicate customer phone number', async () => {
    const cust = (await apiRequest(`/customers/${testCustomerId}`, 'GET', null, adminToken)).data.customer;
    const res = await apiRequest('/customers', 'POST', {
      name: 'Duplicate Phone Tester',
      phone: cust.phone
    }, adminToken);
    assert.strictEqual(res.status, 400, 'Must reject duplicate mobile number');
  });

  // --- MODULE 5: BILLING & INVOICING ENGINE ---
  await runTest('Billing: Barcode lookup for variant returns exact pricing and stock', async () => {
    const variant = (await apiRequest(`/products/${testProductId}/variants`, 'GET', null, adminToken)).data[0];
    const res = await apiRequest(`/billing/barcode-scan?barcode=${encodeURIComponent(variant.barcode)}`, 'GET', null, adminToken);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.found, true);
    assert.strictEqual(res.data.product.variant_id, variant.id);
    assert.strictEqual(res.data.product.selling_price, 700);
  });

  await runTest('Billing: Create multi-item invoice with GST and partial credit', async () => {
    const variant = (await apiRequest(`/products/${testProductId}/variants`, 'GET', null, adminToken)).data[0];
    const cust = (await apiRequest(`/customers/${testCustomerId}`, 'GET', null, adminToken)).data.customer;

    // 2 units of variant at 700 = 1400. 5% GST = 70. Total = 1470.
    // Pay 500, Balance due = 970.
    const res = await apiRequest('/billing/create-invoice', 'POST', {
      customer_id: cust.id,
      customer_name: cust.name,
      customer_phone: cust.phone,
      place_of_supply: 'Tamil Nadu',
      place_of_supply_code: '33',
      payment_method: 'credit',
      amount_paid: 500,
      bill_discount_type: 'flat',
      bill_discount_value: 0,
      items: [{
        product_id: testProductId,
        variant_id: variant.id,
        variant_name: variant.variant_name,
        product_name: 'QA Automation Test Silk Fabric',
        sku: variant.sku,
        hsn_code: '5208',
        unit: 'Meters',
        quantity: 2,
        rate: 700,
        gst_rate: 5.0,
        is_tax_inclusive: false
      }]
    }, adminToken);

    assert.strictEqual(res.status, 201);
    assert(res.data.invoice_number, 'Invoice number must be generated');
    assert.strictEqual(res.data.grand_total, 1470);
    assert.strictEqual(res.data.amount_paid, 500);
    assert.strictEqual(res.data.balance_due, 970);
    assert.strictEqual(res.data.payment_status, 'partial');

    testInvoiceId = res.data.id;
    testInvoiceNumber = res.data.invoice_number;

    // Check variant stock decremented: 25 - 2 = 23
    const varAfter = (await apiRequest(`/products/${testProductId}/variants`, 'GET', null, adminToken)).data[0];
    assert.strictEqual(varAfter.stock_quantity, 23, 'Variant stock must be decremented by 2');

    // Check customer outstanding balance increased by 970
    const custAfter = (await apiRequest(`/customers/${testCustomerId}`, 'GET', null, adminToken)).data.customer;
    assert.strictEqual(custAfter.outstanding_balance, 970, 'Customer outstanding must increase by balance due');
  });

  await runTest('Customer Khata: Ledger chronologically reflects bill debit and partial payment', async () => {
    const res = await apiRequest(`/customers/${testCustomerId}/ledger`, 'GET', null, adminToken);
    assert.strictEqual(res.status, 200);
    const ledger = res.data.ledger;
    assert(ledger.length >= 2, 'Should contain at least the invoice debit and payment credit entries');
    const lastEntry = ledger[ledger.length - 1];
    assert.strictEqual(lastEntry.running_balance, 970, 'Running balance should match remaining balance due 970');
  });

  await runTest('Customer Khata: Settle remaining dues via Khata Payment', async () => {
    const res = await apiRequest(`/customers/${testCustomerId}/payment`, 'POST', {
      amount: 970,
      payment_method: 'upi',
      reference_number: 'UPI-TEST-12345',
      notes: 'Full Khata Clearance'
    }, adminToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.receipt.balance_after, 0, 'Customer balance after full settlement must be 0');

    // Verify customer outstanding is now 0
    const custAfter = (await apiRequest(`/customers/${testCustomerId}`, 'GET', null, adminToken)).data.customer;
    assert.strictEqual(custAfter.outstanding_balance, 0, 'Customer outstanding balance must be 0');
  });

  // --- MODULE 6: SUPPLIERS & PURCHASES ---
  await runTest('Suppliers: Create supplier profile', async () => {
    const res = await apiRequest('/suppliers', 'POST', {
      name: 'Venkateshwara Weaving Mills',
      company_name: 'Venkateshwara Textiles Pvt Ltd',
      phone: '9842211223',
      city: 'Salem',
      state: 'Tamil Nadu',
      gstin: '33AABCV1234D1Z5'
    }, adminToken);

    assert.strictEqual(res.status, 201);
    testSupplierId = res.data.id;
  });

  await runTest('Purchases: Inward purchase entry increments inventory stock atomically', async () => {
    const prodBefore = (await apiRequest(`/products/${testProductId}`, 'GET', null, adminToken)).data;
    const initialProdStock = prodBefore.stock_quantity; // 100 - 2 = 98

    const invoiceNum = `PUR-${Date.now().toString().slice(-6)}`;
    const res = await apiRequest('/purchases', 'POST', {
      purchase_invoice_number: invoiceNum,
      purchase_date: new Date().toISOString().split('T')[0],
      supplier_id: testSupplierId,
      amount_paid: 1000,
      payment_method: 'bank_transfer',
      items: [{
        product_id: testProductId,
        variant_id: testVariantId,
        product_name: 'QA Automation Test Silk Fabric',
        sku: 'TEST-SKU',
        unit: 'Meters',
        quantity: 50,
        purchase_cost: 310,
        gst_rate: 5.0
      }]
    }, adminToken);

    assert.strictEqual(res.status, 201);

    // Verify stock incremented by 50
    const prodAfter = (await apiRequest(`/products/${testProductId}`, 'GET', null, adminToken)).data;
    assert.strictEqual(prodAfter.stock_quantity, initialProdStock + 50, 'Product stock must increment by 50');

    const varAfter = (await apiRequest(`/products/${testProductId}/variants`, 'GET', null, adminToken)).data[0];
    assert.strictEqual(varAfter.stock_quantity, 23 + 50, 'Variant stock must increment by 50');
  });

  // --- MODULE 7: SALES RETURNS & EXCHANGES ---
  await runTest('Returns: Lookup invoice validates items and remaining returnable limits', async () => {
    const res = await apiRequest(`/returns/lookup-invoice/${testInvoiceNumber}`, 'GET', null, adminToken);
    assert.strictEqual(res.status, 200);
    assert(res.data.items.length > 0, 'Must return invoice items');
    const item = res.data.items[0];
    assert.strictEqual(item.can_return, true);
    assert.strictEqual(item.remaining_quantity, 2);
  });

  await runTest('Returns: Process undamaged item return and verify automatic stock restoration', async () => {
    const lookup = (await apiRequest(`/returns/lookup-invoice/${testInvoiceNumber}`, 'GET', null, adminToken)).data;
    const item = lookup.items[0];

    const varBefore = (await apiRequest(`/products/${testProductId}/variants`, 'GET', null, adminToken)).data[0];
    const varStockBefore = varBefore.stock_quantity;

    const res = await apiRequest('/returns', 'POST', {
      invoice_id: testInvoiceId,
      return_type: 'return',
      reason: 'Quality inspection test return',
      refund_method: 'cash',
      return_items: [{
        invoice_item_id: item.id,
        quantity_returned: 1,
        condition: 'undamaged',
        restock: true
      }]
    }, adminToken);

    assert.strictEqual(res.status, 201);
    assert(res.data.return.return_number, 'Return voucher number must be generated');

    // Check variant stock restored by 1
    const varAfter = (await apiRequest(`/products/${testProductId}/variants`, 'GET', null, adminToken)).data[0];
    assert.strictEqual(varAfter.stock_quantity, varStockBefore + 1, 'Stock must be incremented by 1 for undamaged restock');
  });

  await runTest('Returns: Prevent returning more than remaining unreturned quantity', async () => {
    const lookup = (await apiRequest(`/returns/lookup-invoice/${testInvoiceNumber}`, 'GET', null, adminToken)).data;
    const item = lookup.items[0];

    // Already returned 1 of 2. Remaining is 1. Attempt to return 5 should fail with 400.
    const res = await apiRequest('/returns', 'POST', {
      invoice_id: testInvoiceId,
      return_type: 'return',
      reason: 'Excessive return attempt',
      return_items: [{
        invoice_item_id: item.id,
        quantity_returned: 5,
        condition: 'undamaged',
        restock: true
      }]
    }, adminToken);

    assert.strictEqual(res.status, 400, 'Must reject return exceeding remaining purchased quantity');
  });

  // --- MODULE 8: WHATSAPP SHARING API ---
  await runTest('WhatsApp: Formats phone number and template message properly', async () => {
    const res = await apiRequest(`/invoices/${testInvoiceId}/whatsapp?phone=${encodeURIComponent('+91 98421 55678')}`, 'GET', null, adminToken);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.phone, '919842155678');
    assert.strictEqual(res.data.isValid, true);
    assert(res.data.message.includes('Thank you for shopping with us!'), 'Message must contain thank you header');
    assert(res.data.message.includes(testInvoiceNumber), 'Message must include invoice number');
    assert(res.data.whatsappUrl.startsWith('https://wa.me/919842155678'), 'WhatsApp mobile URL must be valid');
    assert(res.data.whatsappWebUrl.startsWith('https://web.whatsapp.com/send?phone=919842155678'), 'WhatsApp Web URL must be valid');
  });

  // --- MODULE 9: REPORTS & ADVANCED ANALYTICS ---
  await runTest('Reports: Advanced Analytics returns real-time calculations from DB', async () => {
    const res = await apiRequest('/reports/advanced-analytics?preset=monthly', 'GET', null, adminToken);
    assert.strictEqual(res.status, 200);
    const a = res.data;
    assert('sales' in a, 'Must contain sales summary');
    assert('cogs' in a, 'Must contain COGS');
    assert('gross_profit' in a, 'Must contain gross profit');
    assert('net_profit' in a, 'Must contain net profit');
    assert(typeof a.gross_profit === 'number', 'Gross profit must be numeric');
    assert(Array.isArray(a.best_sellers), 'Best sellers must be array');
    assert(Array.isArray(a.slow_movers), 'Slow movers must be array');
  });

  // --- MODULE 10: BACKUP & RESTORE INTEGRITY ---
  await runTest('Backup: Create database backup snapshot', async () => {
    const res = await apiRequest('/backup/create', 'POST', {}, adminToken);
    assert.strictEqual(res.status, 200);
    assert(res.data.filename, 'Must return created backup filename');
    assert(res.data.filesize > 0, 'Backup file size must be > 0');

    // Verify backup exists on disk
    const backupsDir = path.join(__dirname, '..', '..', 'backups');
    const fullPath = path.join(backupsDir, res.data.filename);
    assert(fs.existsSync(fullPath), 'Backup file must exist on filesystem');
  });

  await runTest('Backup: List backups reflects newly created snapshot', async () => {
    const res = await apiRequest('/backup/list', 'GET', null, adminToken);
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data), 'Backups list must be an array');
    assert(res.data.length > 0, 'Should have at least one backup snapshot');
  });

  // --- MODULE 11: SAFE DELETION & INTEGRITY ---
  await runTest('Products: Refuse hard deletion and safely deactivate product with billing history', async () => {
    const res = await apiRequest(`/products/${testProductId}`, 'DELETE', null, adminToken);
    assert.strictEqual(res.status, 200);
    assert(res.data.message.includes('safely deactivated'), 'Must safely deactivate instead of hard deleting');

    // Confirm product status is inactive and records remain intact
    const prod = (await apiRequest(`/products/${testProductId}`, 'GET', null, adminToken)).data;
    assert.strictEqual(prod.status, 'inactive', 'Product status must be inactive');
  });

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (failedTests.length > 0) {
    console.log(` FAILED TESTS (${failedTests.length}):`);
    failedTests.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
  }
  console.log('================================================================\n');

  if (failedTests.length > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
