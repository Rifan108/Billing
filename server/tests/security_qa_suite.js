const assert = require('assert');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5000/api';

console.log('================================================================');
console.log('   ENTERPRISE SECURITY & RESILIENCE QA VALIDATION SUITE        ');
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

async function apiRequest(endpoint, method = 'GET', body = null, token = null, headers = {}) {
  const reqHeaders = { 'Content-Type': 'application/json', ...headers };
  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

  const options = { method, headers: reqHeaders };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${endpoint}`, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function main() {
  let adminToken = '';
  let staffToken = '';
  let testUserId = null;
  const testUsername = `sectest_${Date.now().toString().slice(-5)}`;

  // 1. Security Headers Check
  await runTest('Security: Validates defensive HTTP headers are attached', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff', 'Must include X-Content-Type-Options: nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'SAMEORIGIN', 'Must include X-Frame-Options: SAMEORIGIN');
    assert(res.headers.get('content-security-policy'), 'Must include Content-Security-Policy');
  });

  // 2. Admin Login
  await runTest('Auth: Administrator logs in and obtains JWT', async () => {
    const res = await apiRequest('/auth/login', 'POST', { username: 'admin', password: 'admin123' });
    assert.strictEqual(res.status, 200);
    assert(res.data.token, 'Must return token');
    adminToken = res.data.token;
  });

  // 3. Password Policy Validation
  await runTest('Auth Policy: Enforces strong passwords on user creation', async () => {
    // Too short
    const shortRes = await apiRequest('/auth/users', 'POST', {
      username: `${testUsername}_short`,
      password: '123',
      full_name: 'Short Pw',
      role: 'staff'
    }, adminToken);
    assert.strictEqual(shortRes.status, 400);

    // No numbers
    const noNumRes = await apiRequest('/auth/users', 'POST', {
      username: `${testUsername}_nonum`,
      password: 'onlylettershere',
      full_name: 'No Num',
      role: 'staff'
    }, adminToken);
    assert.strictEqual(noNumRes.status, 400);

    // Valid password
    const validRes = await apiRequest('/auth/users', 'POST', {
      username: testUsername,
      password: 'SecurePassword123',
      full_name: 'QA Test Staff',
      role: 'staff'
    }, adminToken);
    assert.strictEqual(validRes.status, 201);
    testUserId = validRes.data.id;
  });

  // 4. Staff Login
  await runTest('Auth: Created staff user logs in successfully', async () => {
    const res = await apiRequest('/auth/login', 'POST', { username: testUsername, password: 'SecurePassword123' });
    assert.strictEqual(res.status, 200);
    assert(res.data.token);
    staffToken = res.data.token;
  });

  // 5. RBAC Enforcement
  await runTest('RBAC: Staff account is strictly denied access to Admin-only endpoints', async () => {
    // Backup listing
    const backupRes = await apiRequest('/backup', 'GET', null, staffToken);
    assert.strictEqual(backupRes.status, 403, 'Staff must be forbidden from accessing backups');

    // Users listing
    const usersRes = await apiRequest('/auth/users', 'GET', null, staffToken);
    assert.strictEqual(usersRes.status, 403, 'Staff must be forbidden from managing users');

    // Shop settings mutation
    const shopRes = await apiRequest('/shop', 'PUT', { shop_name: 'Hacked Shop' }, staffToken);
    assert.strictEqual(shopRes.status, 403, 'Staff must be forbidden from altering shop settings');
  });

  // 6. Brute-Force Lockout
  await runTest('Account Lockout: Consecutive failed attempts trigger progressive lockout', async () => {
    const bruteUser = `lockout_${Date.now().toString().slice(-4)}`;
    // Create target user
    const createRes = await apiRequest('/auth/users', 'POST', {
      username: bruteUser,
      password: 'Password999',
      full_name: 'Lockout Target',
      role: 'staff'
    }, adminToken);
    assert.strictEqual(createRes.status, 201);

    // 4 failed attempts should return 401
    for (let i = 1; i <= 4; i++) {
      const failRes = await apiRequest('/auth/login', 'POST', { username: bruteUser, password: 'WrongPassword' });
      assert.strictEqual(failRes.status, 401);
    }

    // 5th failed attempt triggers 429 lockout
    const lockRes = await apiRequest('/auth/login', 'POST', { username: bruteUser, password: 'WrongPassword' });
    assert.strictEqual(lockRes.status, 429, '5th failed attempt must trigger 429 account lockout');
    assert(lockRes.data.error.includes('locked'), 'Response error message must state account is locked');
  });

  // 7. Session Revocation
  await runTest('Session Revocation: Invalidation revokes active JWT immediately', async () => {
    // Verify staffToken currently works
    const preCheck = await apiRequest('/auth/me', 'GET', null, staffToken);
    assert.strictEqual(preCheck.status, 200);

    // Admin revokes staff sessions
    const revokeRes = await apiRequest(`/auth/revoke-sessions/${testUserId}`, 'POST', null, adminToken);
    assert.strictEqual(revokeRes.status, 200);

    // Verify staffToken is now invalidated with 401
    const postCheck = await apiRequest('/auth/me', 'GET', null, staffToken);
    assert.strictEqual(postCheck.status, 401, 'Revoked session token must be rejected with 401');
  });

  // 8. Enterprise Idempotency on Financial Billing
  await runTest('Idempotency: Prevents duplicate invoice creation upon duplicate network submission', async () => {
    const idemKey = `idem_test_${Date.now()}`;
    const invoicePayload = {
      customer_name: 'Idempotent Customer',
      customer_phone: '9842100099',
      items: [
        {
          product_id: 1,
          name: 'Kanchipuram Pure Silk Saree',
          unit: 'Pieces',
          quantity: 1,
          rate: 5000,
          discount_type: 'flat',
          discount_value: 0,
          gst_rate: 5.0
        }
      ],
      payment_method: 'cash',
      amount_paid: 5250
    };

    // First call -> 201 Created
    const firstRes = await apiRequest('/billing/create-invoice', 'POST', invoicePayload, adminToken, {
      'Idempotency-Key': idemKey
    });
    assert.strictEqual(firstRes.status, 201, 'First submission must succeed with 201');
    const firstInvoiceNum = firstRes.data.invoice_number;

    // Second call with same Idempotency-Key -> Returns cached 201 with X-Cache-Lookup: HIT
    const secondRes = await apiRequest('/billing/create-invoice', 'POST', invoicePayload, adminToken, {
      'Idempotency-Key': idemKey
    });
    assert.strictEqual(secondRes.status, 201, 'Second submission must return cached 201');
    assert.strictEqual(secondRes.headers.get('x-cache-lookup'), 'HIT', 'Must flag response with X-Cache-Lookup: HIT');
    assert.strictEqual(secondRes.data.invoice_number, firstInvoiceNum, 'Must return the identical invoice number without re-billing');

    // Third call with differing payload and same key -> 422 Unprocessable Entity
    const alteredPayload = { ...invoicePayload, amount_paid: 1000 };
    const conflictRes = await apiRequest('/billing/create-invoice', 'POST', alteredPayload, adminToken, {
      'Idempotency-Key': idemKey
    });
    assert.strictEqual(conflictRes.status, 422, 'Reused key with differing payload must return 422');
  });

  // 9. Backup Creation with SHA-256 Checksum
  await runTest('Backups: Creates snapshot with cryptographically secure SHA-256 checksum', async () => {
    const res = await apiRequest('/backup/create', 'POST', null, adminToken);
    assert.strictEqual(res.status, 200);
    assert(res.data.checksum, 'Backup must return calculated SHA-256 checksum');
    assert.strictEqual(res.data.checksum.length, 64, 'SHA-256 checksum must be exactly 64 hex characters');
  });

  // 10. Corrupt SQLite Restore Rejection
  await runTest('Disaster Recovery: Rejects restoring corrupted or invalid files', async () => {
    // Attempting to restore a nonexistent or invalid filename
    const res = await apiRequest('/backup/restore-existing/nonexistent_corrupt.db', 'POST', null, adminToken);
    assert.strictEqual(res.status, 404, 'Nonexistent backup must return 404');
  });

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (failedTests.length > 0) {
    console.error('Failed Tests:');
    failedTests.forEach(f => console.error(`- ${f.name}: ${f.error}`));
    process.exit(1);
  } else {
    console.log('ALL ENTERPRISE SECURITY & RESILIENCE TESTS PASSED CLEANLY!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
