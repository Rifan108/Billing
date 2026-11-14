const QRCode = require('qrcode');

/**
 * Generate UPI Payment URI according to NPCI UPI Specification
 * @param {Object} params
 * @param {string} params.upiId - Merchant VPA (e.g. 'nawazrifan33@oksbi')
 * @param {string} params.payeeName - Shop/Merchant Name
 * @param {number} params.amount - Payable balance (e.g. 2450.00)
 * @param {string} params.invoiceNumber - Invoice reference note
 * @returns {string} - UPI URI string
 */
function buildUpiUri({ upiId, payeeName, amount, invoiceNumber }) {
  const vpa = (upiId || 'nawazrifan33@oksbi').trim();
  const name = encodeURIComponent((payeeName || 'Textile Shop').trim());
  const amt = (typeof amount === 'number' ? amount : parseFloat(amount) || 0).toFixed(2);
  const note = encodeURIComponent(`Invoice_${invoiceNumber || 'BILL'}`);

  // NPCI standard UPI format with unencoded @ in VPA for maximum app compatibility
  return `upi://pay?pa=${vpa}&pn=${name}&am=${amt}&cu=INR&tn=${note}`;
}

/**
 * Generate base64 Data URL for a UPI payment QR code
 */
async function generateUpiQrDataUrl({ upiId, payeeName, amount, invoiceNumber }) {
  const upiUri = buildUpiUri({ upiId, payeeName, amount, invoiceNumber });
  try {
    const dataUrl = await QRCode.toDataURL(upiUri, {
      margin: 1,
      width: 280,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });
    return { upiUri, dataUrl };
  } catch (err) {
    console.error('Error generating UPI QR code:', err);
    throw err;
  }
}

module.exports = {
  buildUpiUri,
  generateUpiQrDataUrl
};
