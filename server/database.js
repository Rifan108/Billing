const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'textile_billing.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency and immediate writes
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    -- Shop Settings (Singleton)
    CREATE TABLE IF NOT EXISTS shop_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      shop_name TEXT NOT NULL,
      tagline TEXT,
      logo_url TEXT,
      address TEXT NOT NULL,
      location TEXT,
      city TEXT NOT NULL,
      district TEXT NOT NULL,
      state TEXT NOT NULL,
      state_code TEXT NOT NULL,
      pincode TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      alt_contact TEXT,
      email TEXT,
      gstin TEXT NOT NULL,
      invoice_prefix TEXT DEFAULT 'TEX',
      invoice_starting_number INTEGER DEFAULT 1001,
      qr_code_url TEXT DEFAULT '/uploads/default_upi_qr.jpg',
      upi_id TEXT DEFAULT 'nawazrifan33@oksbi',
      upi_payee_name TEXT DEFAULT 'Nawaz Rifan',
      thermal_paper_width TEXT DEFAULT '80mm' CHECK(thermal_paper_width IN ('58mm', '80mm')),
      qr_mode TEXT DEFAULT 'dynamic' CHECK(qr_mode IN ('dynamic', 'static')),
      footer_text TEXT DEFAULT 'Thank you for your business! Goods once sold can be exchanged within 7 days with bill in original condition.',
      terms_conditions TEXT DEFAULT '1. All disputes are subject to local jurisdiction.\n2. Cut fabrics and altered garments cannot be exchanged.\n3. Colors are subject to standard textile variation.',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Users & Roles
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'staff')),
      phone TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Categories
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      hsn_default TEXT,
      gst_default REAL DEFAULT 5.0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Products & Inventory
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT UNIQUE,
      category_id INTEGER REFERENCES categories(id),
      category_name TEXT,
      hsn_code TEXT NOT NULL,
      unit TEXT NOT NULL CHECK(unit IN ('Pieces', 'Meters', 'Yards', 'Kilograms', 'Sets', 'Rolls', 'Dozens')),
      purchase_price REAL NOT NULL DEFAULT 0.0,
      selling_price REAL NOT NULL DEFAULT 0.0,
      is_tax_inclusive INTEGER DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 5.0,
      stock_quantity REAL NOT NULL DEFAULT 0.0,
      min_stock_alert REAL NOT NULL DEFAULT 5.0,
      supplier TEXT,
      description TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Customers
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      state_code TEXT,
      gstin TEXT,
      total_purchases REAL DEFAULT 0.0,
      total_bills INTEGER DEFAULT 0,
      outstanding_balance REAL DEFAULT 0.0,
      last_purchase_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Invoices
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      invoice_date TEXT NOT NULL,
      invoice_time TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      customer_address TEXT,
      customer_gstin TEXT,
      place_of_supply TEXT NOT NULL,
      place_of_supply_code TEXT NOT NULL,
      is_inter_state INTEGER DEFAULT 0,
      total_items_count INTEGER NOT NULL,
      subtotal_raw REAL NOT NULL,
      total_product_discount REAL NOT NULL DEFAULT 0.0,
      bill_discount_type TEXT DEFAULT 'flat',
      bill_discount_value REAL DEFAULT 0.0,
      total_bill_discount REAL DEFAULT 0.0,
      total_taxable_amount REAL NOT NULL,
      total_cgst REAL NOT NULL DEFAULT 0.0,
      total_sgst REAL NOT NULL DEFAULT 0.0,
      total_igst REAL NOT NULL DEFAULT 0.0,
      total_tax_amount REAL NOT NULL,
      round_off REAL DEFAULT 0.0,
      grand_total REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0.0,
      balance_due REAL NOT NULL DEFAULT 0.0,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL CHECK(payment_status IN ('paid', 'partial', 'unpaid')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'refunded')),
      cancel_reason TEXT,
      cancelled_at TEXT,
      notes TEXT,
      billed_by_user_id INTEGER REFERENCES users(id),
      billed_by_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Invoice Items
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      sku TEXT,
      hsn_code TEXT NOT NULL,
      category_name TEXT,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL,
      rate REAL NOT NULL,
      discount_type TEXT DEFAULT 'flat',
      discount_value REAL DEFAULT 0.0,
      discount_amount REAL NOT NULL DEFAULT 0.0,
      taxable_amount REAL NOT NULL,
      gst_rate REAL NOT NULL,
      is_inter_state INTEGER DEFAULT 0,
      cgst_rate REAL DEFAULT 0.0,
      cgst_amount REAL DEFAULT 0.0,
      sgst_rate REAL DEFAULT 0.0,
      sgst_amount REAL DEFAULT 0.0,
      igst_rate REAL DEFAULT 0.0,
      igst_amount REAL DEFAULT 0.0,
      total_tax REAL NOT NULL,
      final_amount REAL NOT NULL
    );

    -- Payments
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER REFERENCES invoices(id),
      customer_id INTEGER REFERENCES customers(id),
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      reference_number TEXT,
      notes TEXT,
      received_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Refunds / Credit Notes
    CREATE TABLE IF NOT EXISTS refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      refund_number TEXT UNIQUE NOT NULL,
      refund_date TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT,
      refund_type TEXT NOT NULL CHECK(refund_type IN ('full', 'partial')),
      taxable_refund_amount REAL NOT NULL,
      cgst_refund REAL DEFAULT 0.0,
      sgst_refund REAL DEFAULT 0.0,
      igst_refund REAL DEFAULT 0.0,
      total_tax_refund REAL NOT NULL,
      total_refund_amount REAL NOT NULL,
      refund_payment_method TEXT NOT NULL,
      restock_inventory INTEGER DEFAULT 1,
      reason TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Inventory Transactions Ledger
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('stock_in', 'stock_out', 'sale', 'sale_cancel', 'refund_return', 'adjustment')),
      quantity REAL NOT NULL,
      quantity_before REAL NOT NULL,
      quantity_after REAL NOT NULL,
      unit TEXT NOT NULL,
      reference_id TEXT,
      reason TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Expenses
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      receipt_number TEXT,
      notes TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Backups Metadata
    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      backup_type TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Suppliers Management
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company_name TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      state_code TEXT,
      gstin TEXT,
      payment_terms TEXT DEFAULT '30 Days Net',
      total_purchases REAL DEFAULT 0.0,
      total_paid REAL DEFAULT 0.0,
      outstanding_balance REAL DEFAULT 0.0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Purchases & Stock Inward
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_invoice_number TEXT NOT NULL,
      purchase_date TEXT NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id),
      supplier_name TEXT NOT NULL,
      supplier_gstin TEXT,
      total_items_count INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      tax_amount REAL NOT NULL DEFAULT 0.0,
      discount_amount REAL NOT NULL DEFAULT 0.0,
      additional_charges REAL NOT NULL DEFAULT 0.0,
      grand_total REAL NOT NULL,
      amount_paid REAL NOT NULL DEFAULT 0.0,
      balance_due REAL NOT NULL DEFAULT 0.0,
      payment_status TEXT NOT NULL CHECK(payment_status IN ('paid', 'partial', 'unpaid')),
      payment_method TEXT DEFAULT 'bank_transfer',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'returned')),
      notes TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Purchase Items
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      variant_id INTEGER,
      product_name TEXT NOT NULL,
      sku TEXT,
      hsn_code TEXT,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL,
      purchase_cost REAL NOT NULL,
      discount_percent REAL DEFAULT 0.0,
      gst_rate REAL NOT NULL DEFAULT 5.0,
      tax_amount REAL NOT NULL DEFAULT 0.0,
      total_cost REAL NOT NULL
    );

    -- Supplier Payments
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
      purchase_id INTEGER REFERENCES purchases(id),
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL,
      reference_number TEXT,
      notes TEXT,
      paid_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Product Variants
    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_name TEXT NOT NULL,
      color TEXT,
      size TEXT,
      pattern TEXT,
      material TEXT,
      brand TEXT,
      sku TEXT UNIQUE NOT NULL,
      barcode TEXT UNIQUE,
      purchase_price REAL NOT NULL DEFAULT 0.0,
      selling_price REAL NOT NULL DEFAULT 0.0,
      gst_rate REAL NOT NULL DEFAULT 5.0,
      stock_quantity REAL NOT NULL DEFAULT 0.0,
      min_stock_alert REAL NOT NULL DEFAULT 5.0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Sales Returns & Exchanges
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT UNIQUE NOT NULL,
      return_date TEXT NOT NULL,
      return_time TEXT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      invoice_number TEXT NOT NULL,
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT,
      customer_phone TEXT,
      return_type TEXT NOT NULL CHECK(return_type IN ('return', 'exchange')),
      total_return_items INTEGER NOT NULL,
      total_return_amount REAL NOT NULL,
      total_tax_reversed REAL NOT NULL DEFAULT 0.0,
      cgst_reversed REAL DEFAULT 0.0,
      sgst_reversed REAL DEFAULT 0.0,
      igst_reversed REAL DEFAULT 0.0,
      exchange_invoice_id INTEGER REFERENCES invoices(id),
      exchange_items_amount REAL DEFAULT 0.0,
      net_amount_payable REAL DEFAULT 0.0,
      refund_method TEXT DEFAULT 'cash',
      refund_status TEXT DEFAULT 'completed',
      reason TEXT NOT NULL,
      condition TEXT DEFAULT 'undamaged' CHECK(condition IN ('undamaged', 'damaged')),
      restocked INTEGER DEFAULT 1,
      notes TEXT,
      handled_by_user_id INTEGER REFERENCES users(id),
      handled_by_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Return Items
    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      invoice_item_id INTEGER REFERENCES invoice_items(id),
      product_id INTEGER REFERENCES products(id),
      variant_id INTEGER REFERENCES product_variants(id),
      product_name TEXT NOT NULL,
      sku TEXT,
      unit TEXT NOT NULL,
      quantity_returned REAL NOT NULL,
      rate REAL NOT NULL,
      gst_rate REAL NOT NULL,
      tax_reversed REAL NOT NULL,
      item_refund_amount REAL NOT NULL,
      condition TEXT DEFAULT 'undamaged',
      restocked INTEGER DEFAULT 1
    );

    -- Indices for blazing performance
    CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
    CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);
    CREATE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(barcode);
    CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
    CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
    CREATE INDEX IF NOT EXISTS idx_returns_invoice ON returns(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_transactions(product_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  // Run dynamic schema migrations for thermal printing and dynamic UPI settings
  const shopCols = db.prepare('PRAGMA table_info(shop_settings)').all().map(c => c.name);
  if (!shopCols.includes('thermal_paper_width')) {
    db.exec("ALTER TABLE shop_settings ADD COLUMN thermal_paper_width TEXT DEFAULT '80mm'");
  }
  if (!shopCols.includes('upi_payee_name')) {
    db.exec("ALTER TABLE shop_settings ADD COLUMN upi_payee_name TEXT DEFAULT 'Nawaz Rifan'");
  }
  if (!shopCols.includes('qr_mode')) {
    db.exec("ALTER TABLE shop_settings ADD COLUMN qr_mode TEXT DEFAULT 'dynamic'");
  }

  // Update shop settings with extracted merchant VPA and defaults if still default placeholder
  const currentShop = db.prepare('SELECT upi_id, upi_payee_name, thermal_paper_width, qr_mode FROM shop_settings WHERE id = 1').get();
  if (currentShop) {
    if (!currentShop.upi_id || currentShop.upi_id === 'textileshop@oksbi' || currentShop.upi_id === 'srilakshmi@oksbi') {
      db.prepare("UPDATE shop_settings SET upi_id = 'nawazrifan33@oksbi', upi_payee_name = 'Nawaz Rifan' WHERE id = 1").run();
    }
    if (!currentShop.thermal_paper_width) {
      db.prepare("UPDATE shop_settings SET thermal_paper_width = '80mm' WHERE id = 1").run();
    }
    if (!currentShop.qr_mode) {
      db.prepare("UPDATE shop_settings SET qr_mode = 'dynamic' WHERE id = 1").run();
    }
  }

  // Column migrations for Advanced Retail Management
  const prodCols = db.prepare('PRAGMA table_info(products)').all().map(c => c.name);
  if (!prodCols.includes('has_variants')) {
    db.exec("ALTER TABLE products ADD COLUMN has_variants INTEGER DEFAULT 0");
  }
  if (!prodCols.includes('brand')) {
    db.exec("ALTER TABLE products ADD COLUMN brand TEXT");
  }
  if (!prodCols.includes('color')) {
    db.exec("ALTER TABLE products ADD COLUMN color TEXT");
  }
  if (!prodCols.includes('size')) {
    db.exec("ALTER TABLE products ADD COLUMN size TEXT");
  }

  const invItemCols = db.prepare('PRAGMA table_info(invoice_items)').all().map(c => c.name);
  if (!invItemCols.includes('variant_id')) {
    db.exec("ALTER TABLE invoice_items ADD COLUMN variant_id INTEGER");
  }
  if (!invItemCols.includes('variant_name')) {
    db.exec("ALTER TABLE invoice_items ADD COLUMN variant_name TEXT");
  }
  if (!invItemCols.includes('returned_quantity')) {
    db.exec("ALTER TABLE invoice_items ADD COLUMN returned_quantity REAL DEFAULT 0.0");
  }

  const invCols = db.prepare('PRAGMA table_info(invoices)').all().map(c => c.name);
  if (!invCols.includes('whatsapp_sent_at')) {
    db.exec("ALTER TABLE invoices ADD COLUMN whatsapp_sent_at TEXT");
  }

  // Security and Account Hardening Migrations for Users
  const userSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get();
  const userSql = userSqlRow ? userSqlRow.sql : '';
  if (userSql && !userSql.includes("'manager'")) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        CREATE TABLE users_temp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin', 'manager', 'cashier', 'staff')),
          phone TEXT,
          status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
          token_version INTEGER DEFAULT 1,
          failed_login_attempts INTEGER DEFAULT 0,
          lockout_until TEXT,
          last_login_at TEXT,
          last_login_ip TEXT,
          password_changed_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_temp (id, username, password_hash, full_name, role, phone, status, created_at, updated_at)
        SELECT id, username, password_hash, full_name, role, phone, status, created_at, updated_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_temp RENAME TO users;
      `);
    })();
    db.pragma('foreign_keys = ON');
  }

  const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userCols.includes('token_version')) {
    db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1");
  }
  if (!userCols.includes('failed_login_attempts')) {
    db.exec("ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0");
  }
  if (!userCols.includes('lockout_until')) {
    db.exec("ALTER TABLE users ADD COLUMN lockout_until TEXT");
  }
  if (!userCols.includes('last_login_at')) {
    db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");
  }
  if (!userCols.includes('last_login_ip')) {
    db.exec("ALTER TABLE users ADD COLUMN last_login_ip TEXT");
  }
  if (!userCols.includes('password_changed_at')) {
    db.exec("ALTER TABLE users ADD COLUMN password_changed_at TEXT");
  }

  // Create login_history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      username TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'locked')),
      failure_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_login_history_created ON login_history(created_at);
  `);

  // Create idempotency_keys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      request_path TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_body TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
  `);

  // Backups checksum column
  const backupCols = db.prepare('PRAGMA table_info(backups)').all().map(c => c.name);
  if (!backupCols.includes('checksum')) {
    db.exec("ALTER TABLE backups ADD COLUMN checksum TEXT");
  }

  // Relational indices for performance & integrity
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_refunds_invoice ON refunds(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
  `);

  seedInitialData();
}

function seedInitialData() {
  // Check if shop settings exist
  const existingShop = db.prepare('SELECT id FROM shop_settings WHERE id = 1').get();
  if (!existingShop) {
    db.prepare(`
      INSERT INTO shop_settings (
        id, shop_name, tagline, logo_url, address, location, city, district, state, state_code,
        pincode, contact_number, alt_contact, email, gstin, invoice_prefix,
        invoice_starting_number, qr_code_url, upi_id, footer_text, terms_conditions
      ) VALUES (
        1,
        'SRI LAKSHMI SILKS & TEXTILES',
        'Pure Silks • Designer Sarees • Ready-made Garments • Wholesale & Retail',
        '',
        'Door No. 42/1, Mahatma Gandhi Road, Near Clock Tower',
        'Commercial Center',
        'Coimbatore',
        'Coimbatore',
        'Tamil Nadu',
        '33',
        '641001',
        '+91 98421 55678',
        '+91 422 2345678',
        'contact@srilakshmitextiles.in',
        '33AABCU9603R1ZM',
        'SLT',
        1001,
        '/uploads/default_upi_qr.jpg',
        'srilakshmi@oksbi',
        'THANK YOU FOR SHOPPING WITH US! VISIT AGAIN!',
        '1. All disputes subject to Coimbatore jurisdiction.\n2. Goods once sold can be exchanged within 7 days along with original invoice.\n3. Cut cloth, stained items or altered garments cannot be exchanged.'
      )
    `).run();
  }

  // Check default users
  const adminUser = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!adminUser) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, phone, status)
      VALUES ('admin', ?, 'Administrator', 'admin', '9842155678', 'active')
    `).run(adminHash);
  }

  const staffUser = db.prepare("SELECT id FROM users WHERE username = 'staff'").get();
  if (!staffUser) {
    const staffHash = bcrypt.hashSync('staff123', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, phone, status)
      VALUES ('staff', ?, 'Sales Executive', 'staff', '9842155679', 'active')
    `).run(staffHash);
  }

  // Seed Categories if empty
  const categoryCount = db.prepare('SELECT count(*) as count FROM categories').get().count;
  if (categoryCount === 0) {
    const categories = [
      { name: 'Sarees', description: 'Kanchipuram, Banarasi, Soft Silk, Georgette & Cotton Sarees', hsn_default: '5007', gst_default: 5.0 },
      { name: 'Shirts', description: 'Formal, Casual, Linen, and Pure Cotton Shirts', hsn_default: '6205', gst_default: 5.0 },
      { name: 'Pants', description: 'Trousers, Formal Pants, Chinos & Denim', hsn_default: '6203', gst_default: 5.0 },
      { name: 'Dress Materials', description: 'Chanderi, Cotton, Rayon Unstitched Salwar Suits', hsn_default: '5208', gst_default: 5.0 },
      { name: 'Cotton Fabrics', description: 'Running pure cotton fabric by meter/yard', hsn_default: '5208', gst_default: 5.0 },
      { name: 'Silk Fabrics', description: 'Pure Mulberry & Raw Silk Running Material', hsn_default: '5007', gst_default: 5.0 },
      { name: 'T-Shirts', description: 'Round neck, Polo collared, Knitted T-Shirts', hsn_default: '6109', gst_default: 5.0 },
      { name: 'Towels', description: 'Terry Towels, Bath Sheets, Turkish Cotton Towels', hsn_default: '6302', gst_default: 5.0 },
      { name: 'Bedsheets', description: 'Double Bed, King Size, Printed Cotton Bedsheets with Pillow Covers', hsn_default: '6304', gst_default: 12.0 },
      { name: 'Curtains', description: 'Jacquard, Blackout and Eyelet Window/Door Curtains', hsn_default: '6303', gst_default: 12.0 },
      { name: 'Dhotis & Veshtis', description: 'Traditional Zari Border Silk & Cotton Dhotis', hsn_default: '5208', gst_default: 5.0 },
      { name: 'Suiting & Shirting', description: 'Premium Wool Blend and Terry Rayon Suit Lengths', hsn_default: '5515', gst_default: 5.0 }
    ];

    const insertCat = db.prepare(`
      INSERT INTO categories (name, description, hsn_default, gst_default)
      VALUES (@name, @description, @hsn_default, @gst_default)
    `);
    const insertManyCats = db.transaction((cats) => {
      for (const cat of cats) insertCat.run(cat);
    });
    insertManyCats(categories);
  }

  // Seed Products if empty
  const productCount = db.prepare('SELECT count(*) as count FROM products').get().count;
  if (productCount === 0) {
    const products = [
      {
        name: 'Kanchipuram Pure Silk Saree (Bridal Zari)',
        sku: 'SAR-KAN-001',
        barcode: '8901234001',
        category_name: 'Sarees',
        hsn_code: '5007',
        unit: 'Pieces',
        purchase_price: 6500.0,
        selling_price: 9800.0,
        gst_rate: 5.0,
        stock_quantity: 24.0,
        min_stock_alert: 5.0,
        supplier: 'Sri Murugan Weavers, Kanchipuram',
        description: 'Traditional pure silk with contrast rich pallu and real zari brocade'
      },
      {
        name: 'Banarasi Brocade Semi-Silk Saree',
        sku: 'SAR-BAN-002',
        barcode: '8901234002',
        category_name: 'Sarees',
        hsn_code: '5007',
        unit: 'Pieces',
        purchase_price: 1800.0,
        selling_price: 2950.0,
        gst_rate: 5.0,
        stock_quantity: 45.0,
        min_stock_alert: 8.0,
        supplier: 'Varanasi Weavers Co-op',
        description: 'Floral woven jaal design with festive finish'
      },
      {
        name: 'Pure Cotton Formal Shirt (Slim Fit Size 40)',
        sku: 'SHT-COT-003',
        barcode: '8901234003',
        category_name: 'Shirts',
        hsn_code: '6205',
        unit: 'Pieces',
        purchase_price: 550.0,
        selling_price: 999.0,
        gst_rate: 5.0,
        stock_quantity: 80.0,
        min_stock_alert: 15.0,
        supplier: 'Arvind Mills Garments',
        description: '100% combed cotton, breathable, anti-wrinkle finish'
      },
      {
        name: 'Raymond Formal Suiting Fabric (Dark Charcoal)',
        sku: 'FAB-SUT-004',
        barcode: '8901234004',
        category_name: 'Suiting & Shirting',
        hsn_code: '5515',
        unit: 'Meters',
        purchase_price: 320.0,
        selling_price: 580.0,
        gst_rate: 5.0,
        stock_quantity: 250.0,
        min_stock_alert: 30.0,
        supplier: 'Raymond Authorized Dealer',
        description: 'Poly-viscose premium suiting fabric for coats and trousers'
      },
      {
        name: 'Chanderi Silk-Cotton Dress Material (3-Piece Unstitched)',
        sku: 'DRS-CHA-005',
        barcode: '8901234005',
        category_name: 'Dress Materials',
        hsn_code: '5208',
        unit: 'Sets',
        purchase_price: 950.0,
        selling_price: 1650.0,
        gst_rate: 5.0,
        stock_quantity: 35.0,
        min_stock_alert: 6.0,
        supplier: 'Chanderi Heritage Craft',
        description: 'Top 2.5m, Bottom 2.5m, Chanderi Dupatta with gold border'
      },
      {
        name: 'Tirupur Premium Terry Bath Towel (70x140 cm)',
        sku: 'TWL-TER-006',
        barcode: '8901234006',
        category_name: 'Towels',
        hsn_code: '6302',
        unit: 'Pieces',
        purchase_price: 180.0,
        selling_price: 350.0,
        gst_rate: 5.0,
        stock_quantity: 120.0,
        min_stock_alert: 20.0,
        supplier: 'Tirupur Textile Mills',
        description: '500 GSM plush absorption, 100% ringspun cotton'
      },
      {
        name: 'Pure Linen Trouser Fabric (Beige)',
        sku: 'FAB-LIN-007',
        barcode: '8901234007',
        category_name: 'Cotton Fabrics',
        hsn_code: '5208',
        unit: 'Meters',
        purchase_price: 450.0,
        selling_price: 750.0,
        gst_rate: 5.0,
        stock_quantity: 160.0,
        min_stock_alert: 25.0,
        supplier: 'Jaya Linen Distributors',
        description: '60 Lea pure European flax linen fabric'
      },
      {
        name: 'Glance 100% Cotton King Size Bedsheet with 2 Pillow Covers',
        sku: 'BED-KNG-008',
        barcode: '8901234008',
        category_name: 'Bedsheets',
        hsn_code: '6304',
        unit: 'Sets',
        purchase_price: 850.0,
        selling_price: 1499.0,
        gst_rate: 12.0,
        stock_quantity: 40.0,
        min_stock_alert: 8.0,
        supplier: 'Jaipur Handloom Hub',
        description: '275x275 cm king size bedsheet, 300 thread count sateen'
      },
      {
        name: 'Mayilkan Gold Zari Silk Cotton Dhoti (8 Mulam)',
        sku: 'DHO-MAY-009',
        barcode: '8901234009',
        category_name: 'Dhotis & Veshtis',
        hsn_code: '5208',
        unit: 'Pieces',
        purchase_price: 600.0,
        selling_price: 1100.0,
        gst_rate: 5.0,
        stock_quantity: 50.0,
        min_stock_alert: 10.0,
        supplier: 'Salem Weavers Society',
        description: 'Traditional auspicious peacock eye zari border dhoti with angavastram'
      },
      {
        name: 'Biowash Cotton Crewneck T-Shirt (Pack of 3)',
        sku: 'TSH-BIO-010',
        barcode: '8901234010',
        category_name: 'T-Shirts',
        hsn_code: '6109',
        unit: 'Sets',
        purchase_price: 420.0,
        selling_price: 799.0,
        gst_rate: 5.0,
        stock_quantity: 65.0,
        min_stock_alert: 12.0,
        supplier: 'Tirupur Knitwear Hub',
        description: '180 GSM super combed cotton, pack of 3 assorted colors'
      }
    ];

    const getCat = db.prepare('SELECT id FROM categories WHERE name = ?');
    const insertProd = db.prepare(`
      INSERT INTO products (
        name, sku, barcode, category_id, category_name, hsn_code, unit,
        purchase_price, selling_price, gst_rate, stock_quantity, min_stock_alert,
        supplier, description
      ) VALUES (
        @name, @sku, @barcode, @category_id, @category_name, @hsn_code, @unit,
        @purchase_price, @selling_price, @gst_rate, @stock_quantity, @min_stock_alert,
        @supplier, @description
      )
    `);

    const insertInitialStock = db.prepare(`
      INSERT INTO inventory_transactions (
        product_id, product_name, transaction_type, quantity, quantity_before, quantity_after, unit, reference_id, reason
      ) VALUES (?, ?, 'stock_in', ?, 0, ?, ?, 'INIT-STOCK', 'Initial store inventory opening balance')
    `);

    const insertManyProducts = db.transaction((prods) => {
      for (const p of prods) {
        const cat = getCat.get(p.category_name);
        const catId = cat ? cat.id : null;
        const res = insertProd.run({
          ...p,
          category_id: catId
        });
        insertInitialStock.run(res.lastInsertRowid, p.name, p.stock_quantity, p.stock_quantity, p.unit);
      }
    });

    insertManyProducts(products);
  }

  // Seed initial sample Customers
  const customerCount = db.prepare('SELECT count(*) as count FROM customers').get().count;
  if (customerCount === 0) {
    const customers = [
      {
        name: 'Ramesh Kumar',
        phone: '9840123456',
        email: 'ramesh.k@gmail.com',
        address: '15, Anna Nagar 2nd Street',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        state_code: '33',
        gstin: ''
      },
      {
        name: 'Meenakshi Sundaram',
        phone: '9443198765',
        email: 'meena.sundaram@yahoo.co.in',
        address: '74, Gandhi Bazaar',
        city: 'Madurai',
        state: 'Tamil Nadu',
        state_code: '33',
        gstin: ''
      },
      {
        name: 'Royal Boutique (B2B)',
        phone: '9880155443',
        email: 'purchase@royalboutique.com',
        address: 'Shop 104, Brigade Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        state_code: '29',
        gstin: '29ABCDE1234F1Z5'
      }
    ];

    const insertCust = db.prepare(`
      INSERT INTO customers (name, phone, email, address, city, state, state_code, gstin)
      VALUES (@name, @phone, @email, @address, @city, @state, @state_code, @gstin)
    `);
    const insertManyCustomers = db.transaction((custs) => {
      for (const c of custs) insertCust.run(c);
    });
    insertManyCustomers(customers);
  }

  // Seed sample initial expenses for profit & loss calculations
  const expenseCount = db.prepare('SELECT count(*) as count FROM expenses').get().count;
  if (expenseCount === 0) {
    const today = new Date().toISOString().split('T')[0];
    const expenses = [
      { category: 'Electricity', title: 'Showroom Electricity Bill - TANGEDCO', amount: 3850.0, expense_date: today, payment_method: 'bank_transfer', receipt_number: 'EB-9921', notes: 'Monthly lighting & AC power bill' },
      { category: 'Tea & Refreshments', title: 'Staff & Customer Refreshments', amount: 450.0, expense_date: today, payment_method: 'cash', receipt_number: '', notes: 'Daily tea and snacks' },
      { category: 'Packaging', title: 'Eco-friendly Cloth Carry Bags (500 pcs)', amount: 2500.0, expense_date: today, payment_method: 'upi', receipt_number: 'PKG-401', notes: 'Store branding print bags' }
    ];

    const insertExp = db.prepare(`
      INSERT INTO expenses (category, title, amount, expense_date, payment_method, receipt_number, notes)
      VALUES (@category, @title, @amount, @expense_date, @payment_method, @receipt_number, @notes)
    `);
    for (const exp of expenses) insertExp.run(exp);
  }

  // Seed initial sample Suppliers
  const supplierCount = db.prepare('SELECT count(*) as count FROM suppliers').get().count;
  if (supplierCount === 0) {
    const suppliers = [
      {
        name: 'Sri Murugan Weavers',
        company_name: 'Sri Murugan Silk Weavers Co-op Society',
        phone: '9443211234',
        email: 'murugan.weavers@gmail.com',
        address: '124, Gandhi Road, Weavers Colony',
        city: 'Kanchipuram',
        state: 'Tamil Nadu',
        state_code: '33',
        gstin: '33AABCS1234F1Z1',
        payment_terms: '30 Days Net',
        total_purchases: 156000.0,
        total_paid: 120000.0,
        outstanding_balance: 36000.0
      },
      {
        name: 'Arvind Mills Garments',
        company_name: 'Arvind Lifestyle Textiles Ltd',
        phone: '9825012345',
        email: 'b2b.sales@arvindmills.com',
        address: 'Plot 45, Naroda Industrial Estate',
        city: 'Ahmedabad',
        state: 'Gujarat',
        state_code: '24',
        gstin: '24AAACA1234E1Z3',
        payment_terms: '45 Days Net',
        total_purchases: 85000.0,
        total_paid: 85000.0,
        outstanding_balance: 0.0
      },
      {
        name: 'Varanasi Weavers Co-op',
        company_name: 'Kashi Brocade Handloom Guild',
        phone: '9415098765',
        email: 'kashibrocade@rediffmail.com',
        address: 'B-14, Madanpura Silk Market',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
        state_code: '09',
        gstin: '09AAABK5678H1Z8',
        payment_terms: '15 Days Net',
        total_purchases: 110000.0,
        total_paid: 80000.0,
        outstanding_balance: 30000.0
      },
      {
        name: 'Tirupur Knitwear Hub',
        company_name: 'Apex Cotton Hosiery Exports',
        phone: '9843054321',
        email: 'orders@apexhosiery.in',
        address: '88, Avinashi Road',
        city: 'Tirupur',
        state: 'Tamil Nadu',
        state_code: '33',
        gstin: '33AABCA9876K1Z0',
        payment_terms: 'Immediate / COD',
        total_purchases: 45000.0,
        total_paid: 45000.0,
        outstanding_balance: 0.0
      }
    ];

    const insertSup = db.prepare(`
      INSERT INTO suppliers (name, company_name, phone, email, address, city, state, state_code, gstin, payment_terms, total_purchases, total_paid, outstanding_balance)
      VALUES (@name, @company_name, @phone, @email, @address, @city, @state, @state_code, @gstin, @payment_terms, @total_purchases, @total_paid, @outstanding_balance)
    `);
    const insertManySuppliers = db.transaction((sups) => {
      for (const s of sups) insertSup.run(s);
    });
    insertManySuppliers(suppliers);
  }

  // Seed sample variants for Shirt (Product 3) if variants table is empty
  const variantCount = db.prepare('SELECT count(*) as count FROM product_variants').get().count;
  if (variantCount === 0) {
    const shirtProd = db.prepare("SELECT id FROM products WHERE sku = 'SHT-COT-003'").get();
    if (shirtProd) {
      db.prepare("UPDATE products SET has_variants = 1 WHERE id = ?").run(shirtProd.id);

      const variants = [
        {
          product_id: shirtProd.id,
          variant_name: 'Sky Blue - Size 38 (M)',
          color: 'Sky Blue',
          size: '38 (M)',
          pattern: 'Plain Solid',
          material: 'Pure Cotton',
          brand: 'Sri Lakshmi Classic',
          sku: 'SHT-COT-003-BLU-38',
          barcode: '890123400338',
          purchase_price: 550.0,
          selling_price: 999.0,
          gst_rate: 5.0,
          stock_quantity: 20.0,
          min_stock_alert: 5.0
        },
        {
          product_id: shirtProd.id,
          variant_name: 'Sky Blue - Size 40 (L)',
          color: 'Sky Blue',
          size: '40 (L)',
          pattern: 'Plain Solid',
          material: 'Pure Cotton',
          brand: 'Sri Lakshmi Classic',
          sku: 'SHT-COT-003-BLU-40',
          barcode: '890123400340',
          purchase_price: 550.0,
          selling_price: 999.0,
          gst_rate: 5.0,
          stock_quantity: 25.0,
          min_stock_alert: 5.0
        },
        {
          product_id: shirtProd.id,
          variant_name: 'Sky Blue - Size 42 (XL)',
          color: 'Sky Blue',
          size: '42 (XL)',
          pattern: 'Plain Solid',
          material: 'Pure Cotton',
          brand: 'Sri Lakshmi Classic',
          sku: 'SHT-COT-003-BLU-42',
          barcode: '890123400342',
          purchase_price: 550.0,
          selling_price: 999.0,
          gst_rate: 5.0,
          stock_quantity: 15.0,
          min_stock_alert: 3.0
        },
        {
          product_id: shirtProd.id,
          variant_name: 'Crisp White - Size 40 (L)',
          color: 'Crisp White',
          size: '40 (L)',
          pattern: 'Plain Solid',
          material: 'Pure Cotton',
          brand: 'Sri Lakshmi Classic',
          sku: 'SHT-COT-003-WHT-40',
          barcode: '890123400344',
          purchase_price: 550.0,
          selling_price: 999.0,
          gst_rate: 5.0,
          stock_quantity: 20.0,
          min_stock_alert: 5.0
        }
      ];

      const insertVar = db.prepare(`
        INSERT INTO product_variants (
          product_id, variant_name, color, size, pattern, material, brand,
          sku, barcode, purchase_price, selling_price, gst_rate, stock_quantity, min_stock_alert
        ) VALUES (
          @product_id, @variant_name, @color, @size, @pattern, @material, @brand,
          @sku, @barcode, @purchase_price, @selling_price, @gst_rate, @stock_quantity, @min_stock_alert
        )
      `);
      for (const v of variants) insertVar.run(v);
    }
  }
}

initDatabase();

module.exports = db;

