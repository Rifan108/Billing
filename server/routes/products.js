const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

// --- CATEGORIES ---

// Get all categories
router.get('/categories', (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, count(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all();
  res.json(categories);
});

// Create category
router.post('/categories', requireAuth, (req, res) => {
  const { name, description, hsn_default, gst_default } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  const existing = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?)').get(name.trim());
  if (existing) {
    return res.status(400).json({ error: 'A category with this name already exists' });
  }

  const result = db.prepare(`
    INSERT INTO categories (name, description, hsn_default, gst_default)
    VALUES (?, ?, ?, ?)
  `).run(name.trim(), description || '', hsn_default || '', parseFloat(gst_default) || 5.0);

  logAudit(req.user.id, req.user.full_name, 'CATEGORY_CREATE', 'categories', result.lastInsertRowid, `Created category ${name}`);

  res.status(201).json({
    id: result.lastInsertRowid,
    name: name.trim(),
    description,
    hsn_default,
    gst_default
  });
});

// Update category
router.put('/categories/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { name, description, hsn_default, gst_default } = req.body;

  db.prepare(`
    UPDATE categories
    SET name = ?, description = ?, hsn_default = ?, gst_default = ?
    WHERE id = ?
  `).run(name.trim(), description || '', hsn_default || '', parseFloat(gst_default) || 5.0, id);

  // Update category_name in products table
  db.prepare('UPDATE products SET category_name = ? WHERE category_id = ?').run(name.trim(), id);

  logAudit(req.user.id, req.user.full_name, 'CATEGORY_UPDATE', 'categories', id, `Updated category ${name}`);

  res.json({ message: 'Category updated successfully' });
});

// Delete category
router.delete('/categories/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const productsCount = db.prepare('SELECT count(*) as count FROM products WHERE category_id = ?').get(id).count;
  if (productsCount > 0) {
    return res.status(400).json({ error: `Cannot delete category: ${productsCount} products are linked to it. Reassign products first.` });
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  logAudit(req.user.id, req.user.full_name, 'CATEGORY_DELETE', 'categories', id, `Deleted category ID ${id}`);

  res.json({ message: 'Category deleted successfully' });
});

// --- PRODUCTS ---

// Get all products with filters
router.get('/', (req, res) => {
  const { q, category_id, status, stock_status } = req.query;

  let query = `
    SELECT p.*, c.name as category_display_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ` AND p.status = ?`;
    params.push(status);
  } else {
    query += ` AND p.status = 'active'`;
  }

  if (category_id) {
    query += ` AND p.category_id = ?`;
    params.push(category_id);
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.hsn_code LIKE ?)`;
    params.push(term, term, term, term);
  }

  if (stock_status === 'out_of_stock') {
    query += ` AND p.stock_quantity <= 0`;
  } else if (stock_status === 'low_stock') {
    query += ` AND p.stock_quantity > 0 AND p.stock_quantity <= p.min_stock_alert`;
  }

  query += ` ORDER BY p.name ASC`;

  const products = db.prepare(query).all(...params);
  res.json(products);
});

// Get product by ID
router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(product);
});

// Create product
router.post('/', requireAuth, (req, res) => {
  const {
    name, sku, barcode, category_id, hsn_code, unit,
    purchase_price, selling_price, is_tax_inclusive, gst_rate,
    stock_quantity, min_stock_alert, supplier, description
  } = req.body;

  if (!name || !sku || !hsn_code || !unit || selling_price === undefined) {
    return res.status(400).json({ error: 'Please provide product name, SKU, HSN code, unit, and selling price' });
  }

  const existingSku = db.prepare('SELECT id FROM products WHERE lower(sku) = lower(?)').get(sku.trim());
  if (existingSku) {
    return res.status(400).json({ error: 'A product with this SKU already exists' });
  }

  if (barcode && barcode.trim()) {
    const existingBarcode = db.prepare('SELECT id FROM products WHERE barcode = ?').get(barcode.trim());
    if (existingBarcode) {
      return res.status(400).json({ error: 'A product with this Barcode already exists' });
    }
  }

  let catName = '';
  if (category_id) {
    const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(category_id);
    if (cat) catName = cat.name;
  }

  const initialStock = parseFloat(stock_quantity) || 0;

  const insertProd = db.prepare(`
    INSERT INTO products (
      name, sku, barcode, category_id, category_name, hsn_code, unit,
      purchase_price, selling_price, is_tax_inclusive, gst_rate, stock_quantity,
      min_stock_alert, supplier, description, status
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, 'active'
    )
  `);

  const insertTxn = db.prepare(`
    INSERT INTO inventory_transactions (
      product_id, product_name, transaction_type, quantity, quantity_before, quantity_after, unit, reference_id, reason, created_by_user_id
    ) VALUES (?, ?, 'stock_in', ?, 0, ?, ?, 'INIT-CREATE', 'Initial product creation stock', ?)
  `);

  let newProductId;
  const transaction = db.transaction(() => {
    const result = insertProd.run(
      name.trim(),
      sku.trim().toUpperCase(),
      barcode ? barcode.trim() : null,
      category_id || null,
      catName,
      hsn_code.trim(),
      unit,
      parseFloat(purchase_price) || 0,
      parseFloat(selling_price) || 0,
      is_tax_inclusive ? 1 : 0,
      parseFloat(gst_rate) || 5.0,
      initialStock,
      parseFloat(min_stock_alert) || 5.0,
      supplier ? supplier.trim() : '',
      description ? description.trim() : ''
    );
    newProductId = result.lastInsertRowid;

    if (initialStock > 0) {
      insertTxn.run(newProductId, name.trim(), initialStock, initialStock, unit, req.user.id);
    }
  });

  transaction();

  logAudit(req.user.id, req.user.full_name, 'PRODUCT_CREATE', 'products', newProductId, `Added product ${name} (${sku}) with initial stock ${initialStock}`);

  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(newProductId);
  res.status(201).json(created);
});

// Update product
router.put('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const {
    name, sku, barcode, category_id, hsn_code, unit,
    purchase_price, selling_price, is_tax_inclusive, gst_rate,
    min_stock_alert, supplier, description, status
  } = req.body;

  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Check unique SKU
  if (sku && sku.trim().toLowerCase() !== current.sku.toLowerCase()) {
    const existing = db.prepare('SELECT id FROM products WHERE lower(sku) = lower(?) AND id != ?').get(sku.trim(), id);
    if (existing) {
      return res.status(400).json({ error: 'A product with this SKU already exists' });
    }
  }

  // Check unique barcode
  if (barcode && barcode.trim() !== current.barcode) {
    const existing = db.prepare('SELECT id FROM products WHERE barcode = ? AND id != ?').get(barcode.trim(), id);
    if (existing) {
      return res.status(400).json({ error: 'A product with this Barcode already exists' });
    }
  }

  let catName = current.category_name;
  if (category_id) {
    const cat = db.prepare('SELECT name FROM categories WHERE id = ?').get(category_id);
    if (cat) catName = cat.name;
  }

  db.prepare(`
    UPDATE products
    SET name = ?, sku = ?, barcode = ?, category_id = ?, category_name = ?, hsn_code = ?,
        unit = ?, purchase_price = ?, selling_price = ?, is_tax_inclusive = ?,
        gst_rate = ?, min_stock_alert = ?, supplier = ?, description = ?, status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    name ? name.trim() : current.name,
    sku ? sku.trim().toUpperCase() : current.sku,
    barcode !== undefined ? (barcode ? barcode.trim() : null) : current.barcode,
    category_id !== undefined ? category_id : current.category_id,
    catName,
    hsn_code ? hsn_code.trim() : current.hsn_code,
    unit || current.unit,
    purchase_price !== undefined ? parseFloat(purchase_price) : current.purchase_price,
    selling_price !== undefined ? parseFloat(selling_price) : current.selling_price,
    is_tax_inclusive !== undefined ? (is_tax_inclusive ? 1 : 0) : current.is_tax_inclusive,
    gst_rate !== undefined ? parseFloat(gst_rate) : current.gst_rate,
    min_stock_alert !== undefined ? parseFloat(min_stock_alert) : current.min_stock_alert,
    supplier !== undefined ? supplier.trim() : current.supplier,
    description !== undefined ? description.trim() : current.description,
    status || current.status,
    id
  );

  logAudit(req.user.id, req.user.full_name, 'PRODUCT_UPDATE', 'products', id, `Updated product details for ${name || current.name}`);

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json(updated);
});

// Delete or deactivate product
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ error: 'Product not found' });
  }

  // Check if product was billed in invoices
  const billedCount = db.prepare('SELECT count(*) as count FROM invoice_items WHERE product_id = ?').get(id).count;
  if (billedCount > 0) {
    // Soft delete / mark inactive to preserve invoice history
    db.prepare("UPDATE products SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    logAudit(req.user.id, req.user.full_name, 'PRODUCT_DEACTIVATE', 'products', id, `Deactivated product ${current.name} (has ${billedCount} historic bill lines)`);
    return res.json({ message: 'Product has historic billing records, so it was safely deactivated instead of deleted.' });
  }

  // Hard delete if never billed
  db.prepare('DELETE FROM inventory_transactions WHERE product_id = ?').run(id);
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  logAudit(req.user.id, req.user.full_name, 'PRODUCT_DELETE', 'products', id, `Permanently deleted product ${current.name}`);

  res.json({ message: 'Product permanently deleted' });
});

// Stock Adjustments (Stock In, Stock Out, Physical count correction)
router.post('/:id/adjust-stock', requireAuth, (req, res) => {
  const { id } = req.params;
  const { type, quantity, reason, reference_id } = req.body;

  if (!type || !quantity || parseFloat(quantity) <= 0) {
    return res.status(400).json({ error: 'Invalid adjustment type or quantity' });
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const qty = parseFloat(quantity);
  const currentStock = product.stock_quantity;
  let newStock = currentStock;

  if (type === 'stock_in') {
    newStock = Math.round((currentStock + qty) * 100) / 100;
  } else if (type === 'stock_out') {
    if (currentStock < qty) {
      return res.status(400).json({ error: `Cannot deduct ${qty} ${product.unit}. Current stock is only ${currentStock} ${product.unit}.` });
    }
    newStock = Math.round((currentStock - qty) * 100) / 100;
  } else if (type === 'adjustment') {
    newStock = qty; // Direct overwrite
  } else {
    return res.status(400).json({ error: 'Adjustment type must be stock_in, stock_out, or adjustment' });
  }

  const delta = Math.round((newStock - currentStock) * 100) / 100;

  const txn = db.transaction(() => {
    db.prepare('UPDATE products SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStock, id);
    db.prepare(`
      INSERT INTO inventory_transactions (
        product_id, product_name, transaction_type, quantity, quantity_before, quantity_after, unit, reference_id, reason, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      product.name,
      type,
      delta,
      currentStock,
      newStock,
      product.unit,
      reference_id || `ADJ-${Date.now().toString().slice(-6)}`,
      reason || 'Manual inventory adjustment',
      req.user.id
    );
  });

  txn();

  logAudit(req.user.id, req.user.full_name, 'STOCK_ADJUST', 'products', id, `Adjusted stock for ${product.name}: ${currentStock} -> ${newStock} (${reason || type})`);

  res.json({
    message: 'Stock adjusted successfully',
    product_id: id,
    previous_stock: currentStock,
    new_stock: newStock,
    unit: product.unit
  });
});

// Product stock transactions history
router.get('/:id/transactions', (req, res) => {
  const transactions = db.prepare(`
    SELECT t.*, u.full_name as user_name
    FROM inventory_transactions t
    LEFT JOIN users u ON t.created_by_user_id = u.id
    WHERE t.product_id = ?
    ORDER BY t.id DESC
  `).all(req.params.id);
  res.json(transactions);
});

// Full Inventory Ledger
router.get('/ledger/all', (req, res) => {
  const { limit = 100, type } = req.query;
  let query = `
    SELECT t.*, u.full_name as user_name
    FROM inventory_transactions t
    LEFT JOIN users u ON t.created_by_user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (type) {
    query += ` AND t.transaction_type = ?`;
    params.push(type);
  }
  query += ` ORDER BY t.id DESC LIMIT ?`;
  params.push(parseInt(limit, 10));

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// Low Stock & Out of Stock Alerts
router.get('/alerts/status', (req, res) => {
  const lowStock = db.prepare(`
    SELECT * FROM products
    WHERE status = 'active' AND stock_quantity > 0 AND stock_quantity <= min_stock_alert
    ORDER BY stock_quantity ASC
  `).all();

  const outOfStock = db.prepare(`
    SELECT * FROM products
    WHERE status = 'active' AND stock_quantity <= 0
    ORDER BY name ASC
  `).all();

  res.json({
    low_stock: lowStock,
    low_stock_count: lowStock.length,
    out_of_stock: outOfStock,
    out_of_stock_count: outOfStock.length
  });
});

module.exports = router;

