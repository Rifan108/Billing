const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { INDIAN_STATES, getStateByName, getStateByCode } = require('../services/gstEngine');
const { logAudit } = require('../services/auditService');

// Multer storage for logo & QR code
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const prefix = file.fieldname === 'qr_code' ? 'qr_' : 'logo_';
    cb(null, `${prefix}${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|svg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WEBP, SVG) are allowed'));
    }
  }
});

// Get shop settings
router.get('/', (req, res) => {
  const settings = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();
  res.json(settings);
});

// Get Indian states with GST codes
router.get('/states', (req, res) => {
  res.json(INDIAN_STATES);
});

// Update shop settings (admin only)
router.put('/', requireAdmin, (req, res) => {
  const {
    shop_name, tagline, address, location, city, district, state, state_code,
    pincode, contact_number, alt_contact, email, gstin, invoice_prefix,
    invoice_starting_number, upi_id, upi_payee_name, thermal_paper_width, qr_mode,
    footer_text, terms_conditions
  } = req.body;

  if (!shop_name || !address || !city || !district || !state || !pincode || !contact_number || !gstin) {
    return res.status(400).json({ error: 'Please provide all mandatory shop details' });
  }

  // Auto derive state_code if not explicitly sent
  let resolvedStateCode = state_code;
  if (!resolvedStateCode) {
    const matchedState = getStateByName(state);
    if (matchedState) resolvedStateCode = matchedState.code;
  }

  const validPaperWidth = (thermal_paper_width === '58mm' || thermal_paper_width === '80mm') ? thermal_paper_width : '80mm';
  const validQrMode = (qr_mode === 'static' || qr_mode === 'dynamic') ? qr_mode : 'dynamic';

  db.prepare(`
    UPDATE shop_settings
    SET shop_name = ?, tagline = ?, address = ?, location = ?, city = ?, district = ?,
        state = ?, state_code = ?, pincode = ?, contact_number = ?, alt_contact = ?,
        email = ?, gstin = ?, invoice_prefix = ?, invoice_starting_number = ?,
        upi_id = ?, upi_payee_name = ?, thermal_paper_width = ?, qr_mode = ?,
        footer_text = ?, terms_conditions = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(
    shop_name.trim(),
    tagline ? tagline.trim() : '',
    address.trim(),
    location ? location.trim() : '',
    city.trim(),
    district.trim(),
    state.trim(),
    resolvedStateCode || '33',
    pincode.trim(),
    contact_number.trim(),
    alt_contact ? alt_contact.trim() : '',
    email ? email.trim() : '',
    gstin.trim().toUpperCase(),
    (invoice_prefix || 'TEX').trim().toUpperCase(),
    parseInt(invoice_starting_number, 10) || 1001,
    upi_id ? upi_id.trim() : 'nawazrifan33@oksbi',
    upi_payee_name ? upi_payee_name.trim() : 'Nawaz Rifan',
    validPaperWidth,
    validQrMode,
    footer_text || '',
    terms_conditions || ''
  );

  logAudit(req.user.id, req.user.full_name, 'SHOP_SETTINGS_UPDATE', 'shop_settings', 1, 'Updated shop configuration and GST details');

  const updated = db.prepare('SELECT * FROM shop_settings WHERE id = 1').get();
  res.json(updated);
});

// Upload shop logo (admin only)
router.post('/logo', requireAdmin, upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No logo image file uploaded' });
  }

  const logoUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE shop_settings SET logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(logoUrl);

  logAudit(req.user.id, req.user.full_name, 'SHOP_SETTINGS_UPDATE', 'shop_settings', 1, `Uploaded new shop logo: ${logoUrl}`);

  res.json({ logo_url: logoUrl, message: 'Shop logo updated successfully' });
});

// Upload shop QR code (admin only)
router.post('/qr-code', requireAdmin, upload.single('qr_code'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No QR code image file uploaded' });
  }

  const qrUrl = `/uploads/${req.file.filename}`;
  // Also copy to client public/uploads if needed
  try {
    const clientDest = path.join(__dirname, '..', '..', 'client', 'public', 'uploads', req.file.filename);
    fs.copyFileSync(req.file.path, clientDest);
  } catch (err) {
    console.error('Failed to copy QR code to client/public/uploads:', err.message);
  }

  db.prepare('UPDATE shop_settings SET qr_code_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(qrUrl);

  logAudit(req.user.id, req.user.full_name, 'SHOP_SETTINGS_UPDATE', 'shop_settings', 1, `Uploaded new payment QR code: ${qrUrl}`);

  res.json({ qr_code_url: qrUrl, message: 'Shop QR code updated successfully' });
});

module.exports = router;

