import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Invoice, ShopSettings } from '../types';

export type ThermalPaperWidth = '58mm' | '80mm';
export type QrCodeMode = 'dynamic' | 'static';

export interface QrCodeResult {
  qrUrl: string;
  isDynamic: boolean;
  amount: number;
  upiUri?: string;
  isPaid?: boolean;
}

/**
 * Generate official NPCI UPI intent URI with automatic bill payable amount
 */
export function buildUpiPaymentUri({
  merchantVpa,
  payeeName,
  amount,
  invoiceNumber
}: {
  merchantVpa: string;
  payeeName: string;
  amount: number;
  invoiceNumber: string;
}): string {
  const vpa = merchantVpa.trim();
  const name = encodeURIComponent((payeeName || 'Textile Shop').trim());
  const amt = Math.max(0, amount).toFixed(2);
  const note = encodeURIComponent(`Invoice_${invoiceNumber || 'BILL'}`);

  return `upi://pay?pa=${vpa}&pn=${name}&am=${amt}&cu=INR&tn=${note}`;
}

/**
 * Generate QR code data URL:
 * - If dynamic mode is enabled and merchant VPA is present, generates sharp UPI QR with exact amount.
 * - If static mode or fallback, preserves the merchant's uploaded QR image exactly.
 */
export async function getReceiptQrCodeDataUrl({
  invoice,
  shop,
  mode = 'dynamic'
}: {
  invoice: Invoice;
  shop: ShopSettings;
  mode?: QrCodeMode;
}): Promise<QrCodeResult> {
  const remainingDue = typeof invoice.balance_due === 'number'
    ? invoice.balance_due
    : (invoice.grand_total - (invoice.amount_paid || 0));
  
  const isFullyPaid = remainingDue <= 0 && (invoice.payment_status === 'paid' || (invoice.amount_paid || 0) >= invoice.grand_total);
  const payableAmount = remainingDue > 0 ? remainingDue : (isFullyPaid ? 0 : invoice.grand_total);

  const fallbackQrUrl = shop.qr_code_url || '/uploads/default_upi_qr.jpg';
  const merchantVpa = shop.upi_id ? shop.upi_id.trim() : '';

  // If static mode explicitly selected or no VPA configured, preserve existing QR image exactly
  if (mode === 'static' || !merchantVpa) {
    return {
      qrUrl: fallbackQrUrl,
      isDynamic: false,
      amount: payableAmount,
      isPaid: isFullyPaid
    };
  }

  // Generate dynamic NPCI UPI QR code with payable amount
  try {
    const amtToEncode = payableAmount > 0 ? payableAmount : invoice.grand_total;
    const payeeName = shop.upi_payee_name || shop.shop_name || 'Sri Lakshmi Silks';
    const upiUri = buildUpiPaymentUri({
      merchantVpa,
      payeeName,
      amount: amtToEncode,
      invoiceNumber: invoice.invoice_number
    });

    const dataUrl = await QRCode.toDataURL(upiUri, {
      margin: 0,
      width: 320,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });

    return {
      qrUrl: dataUrl,
      isDynamic: true,
      amount: amtToEncode,
      upiUri,
      isPaid: isFullyPaid
    };
  } catch (err) {
    console.error('Failed to generate dynamic QR code, preserving existing QR image:', err);
    return {
      qrUrl: fallbackQrUrl,
      isDynamic: false,
      amount: payableAmount,
      isPaid: isFullyPaid
    };
  }
}

/**
 * Generate clean, professional thermal receipt HTML content
 * Strictly arranged:
 * 1. Shop details
 * 2. Invoice number, date, time, place
 * 3. Customer details
 * 4. Product information table (item name wraps naturally, numbers stay aligned)
 * 5. Quantity, rate, amount
 * 6. Subtotal
 * 7. Discount
 * 8. CGST and SGST or IGST
 * 9. Grand total
 * 10. Amount paid and balance due
 * 11. QR code (ONLY the clean QR image, centered, no borders, no labels)
 * 12. Thank-you message
 */
export function generateThermalReceiptHtml({
  invoice,
  shop,
  paperWidth = '80mm',
  qrDataUrl
}: {
  invoice: Invoice;
  shop: ShopSettings;
  paperWidth: ThermalPaperWidth;
  qrDataUrl: string;
}): string {
  const is58mm = paperWidth === '58mm';
  const widthMm = is58mm ? '58mm' : '80mm';
  const bodyWidthMm = is58mm ? '48mm' : '72mm';
  const fontSizeBase = is58mm ? '10px' : '11.5px';
  const fontSizeHeading = is58mm ? '13px' : '15px';
  const fontSizeSub = is58mm ? '9px' : '10px';
  const qrDimension = is58mm ? '105px' : '130px';

  const items = invoice.items || [];
  const remainingDue = typeof invoice.balance_due === 'number'
    ? invoice.balance_due
    : (invoice.grand_total - (invoice.amount_paid || 0));
  const isFullyPaid = remainingDue <= 0 && (invoice.payment_status === 'paid' || (invoice.amount_paid || 0) >= invoice.grand_total);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt_${invoice.invoice_number}</title>
  <style>
    @page {
      size: ${widthMm} auto;
      margin: 0mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      background: #fff;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: ${bodyWidthMm};
      max-width: ${bodyWidthMm};
      margin: 0 auto;
      padding: 2mm 1mm;
      font-family: 'Courier New', Courier, monospace, monospace;
      font-size: ${fontSizeBase};
      line-height: 1.25;
      word-break: break-word;
      overflow-wrap: break-word;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .bold { font-weight: bold; }
    .font-mono { font-family: 'Courier New', Courier, monospace; }
    
    .divider {
      border-bottom: 1px dashed #000;
      margin: 4px 0;
    }
    .divider-double {
      border-bottom: 2px solid #000;
      margin: 4px 0;
    }

    .store-header {
      text-align: center;
      margin-bottom: 4px;
    }
    .store-name {
      font-size: ${fontSizeHeading};
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: -0.2px;
      line-height: 1.15;
    }
    .store-sub {
      font-size: ${fontSizeSub};
      margin-top: 1px;
    }

    .meta-table, .totals-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: ${fontSizeBase};
    }
    .meta-table td {
      padding: 1px 0;
      vertical-align: top;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 3px 0;
      font-size: ${fontSizeBase};
    }
    .items-table th {
      border-bottom: 1px dashed #000;
      padding: 2px 0;
      font-size: ${fontSizeSub};
      text-transform: uppercase;
    }
    .items-table td {
      padding: 1.5px 0;
      vertical-align: top;
    }

    .totals-table td {
      padding: 1px 0;
    }
    .grand-total-row {
      font-size: ${fontSizeHeading};
      font-weight: 900;
      padding: 2px 0;
    }

    .qr-container {
      text-align: center;
      margin: 6px auto 4px auto;
      padding: 0;
      line-height: 0;
    }
    .qr-image {
      width: ${qrDimension};
      height: ${qrDimension};
      object-fit: contain;
      display: block;
      margin: 0 auto;
      border: none;
      padding: 0;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
    }

    .footer-note {
      font-size: ${fontSizeSub};
      text-align: center;
      margin-top: 4px;
      line-height: 1.2;
    }
  </style>
</head>
<body>

  <!-- 1. SHOP DETAILS -->
  <div class="store-header">
    <div class="store-name">${shop.shop_name}</div>
    ${shop.tagline ? `<div class="store-sub">${shop.tagline}</div>` : ''}
    <div class="store-sub">${shop.address}, ${shop.city} - ${shop.pincode}</div>
    <div class="store-sub">Ph: ${shop.contact_number}${shop.alt_contact ? ` / ${shop.alt_contact}` : ''}</div>
    <div class="store-sub bold">GSTIN: ${shop.gstin}</div>
  </div>

  <div class="divider"></div>

  <!-- 2. INVOICE NUMBER & DATE -->
  <table class="meta-table">
    <tr>
      <td class="bold" style="width: 25%;">Bill No:</td>
      <td class="bold font-mono" style="width: 35%;">${invoice.invoice_number}</td>
      <td class="bold text-right" style="width: 15%;">Date:</td>
      <td class="text-right font-mono" style="width: 25%;">${invoice.invoice_date}</td>
    </tr>
    <tr>
      <td>Time:</td>
      <td class="font-mono">${invoice.invoice_time || ''}</td>
      <td class="text-right">State:</td>
      <td class="text-right">${invoice.place_of_supply || shop.state}</td>
    </tr>
  </table>

  <!-- 3. CUSTOMER DETAILS -->
  <table class="meta-table" style="margin-top: 1px;">
    <tr>
      <td style="width: 20%;">Cust:</td>
      <td class="bold" style="width: 80%;">${invoice.customer_name || 'Walk-in Customer'}</td>
    </tr>
    ${invoice.customer_phone ? `
    <tr>
      <td>Mob:</td>
      <td class="font-mono">+91 ${invoice.customer_phone}</td>
    </tr>` : ''}
    ${invoice.customer_gstin ? `
    <tr>
      <td>GSTIN:</td>
      <td class="font-mono bold">${invoice.customer_gstin}</td>
    </tr>` : ''}
  </table>

  <div class="divider"></div>

  <!-- 4 & 5. PRODUCT INFORMATION (Item, Qty, Rate, Amount) -->
  <table class="items-table">
    <thead>
      <tr>
        <th class="text-left" style="width: ${is58mm ? '42%' : '46%'};">Item</th>
        <th class="text-center" style="width: 18%;">Qty</th>
        <th class="text-right" style="width: 20%;">Rate</th>
        <th class="text-right" style="width: ${is58mm ? '20%' : '16%'};">Amt</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
        <tr>
          <td colspan="4" class="bold" style="padding-top: 2px;">
            ${item.product_name}
          </td>
        </tr>
        <tr>
          <td style="font-size: ${fontSizeSub}; color: #333;">
            HSN:${item.hsn_code} (${item.gst_rate}%)
          </td>
          <td class="text-center font-mono">
            ${item.quantity} ${item.unit ? item.unit.slice(0, 3) : 'Pcs'}
          </td>
          <td class="text-right font-mono">
            ${Number(item.rate).toFixed(2)}
          </td>
          <td class="text-right font-mono bold">
            ${Number(item.final_amount).toFixed(2)}
          </td>
        </tr>
        ${item.discount_amount > 0 ? `
        <tr>
          <td colspan="4" style="font-size: ${fontSizeSub}; text-align: right;">
            Discount: -₹${Number(item.discount_amount).toFixed(2)}
          </td>
        </tr>` : ''}
      `).join('')}
    </tbody>
  </table>

  <div class="divider"></div>

  <!-- 6. SUBTOTAL & 7. DISCOUNT & 8. TAXES -->
  <table class="totals-table">
    <tr>
      <td style="width: 55%;">Total Items / Qty:</td>
      <td class="text-right font-mono" style="width: 45%;">${invoice.total_items_count} items</td>
    </tr>
    <tr>
      <td>Subtotal:</td>
      <td class="text-right font-mono">₹${Number(invoice.subtotal_raw).toFixed(2)}</td>
    </tr>
    ${(invoice.total_product_discount + invoice.total_bill_discount) > 0 ? `
    <tr>
      <td>Total Discount:</td>
      <td class="text-right font-mono">-₹${Number(invoice.total_product_discount + invoice.total_bill_discount).toFixed(2)}</td>
    </tr>` : ''}
    <tr>
      <td>Taxable Amount:</td>
      <td class="text-right font-mono">₹${Number(invoice.total_taxable_amount).toFixed(2)}</td>
    </tr>
    ${!invoice.is_inter_state ? `
    <tr>
      <td>CGST:</td>
      <td class="text-right font-mono">₹${Number(invoice.total_cgst).toFixed(2)}</td>
    </tr>
    <tr>
      <td>SGST:</td>
      <td class="text-right font-mono">₹${Number(invoice.total_sgst).toFixed(2)}</td>
    </tr>` : `
    <tr>
      <td>IGST:</td>
      <td class="text-right font-mono">₹${Number(invoice.total_igst).toFixed(2)}</td>
    </tr>`}
    <tr>
      <td>Total GST:</td>
      <td class="text-right font-mono">₹${Number(invoice.total_tax_amount).toFixed(2)}</td>
    </tr>
    ${invoice.round_off !== 0 ? `
    <tr>
      <td>Round Off:</td>
      <td class="text-right font-mono">${invoice.round_off > 0 ? `+₹${invoice.round_off.toFixed(2)}` : `-₹${Math.abs(invoice.round_off).toFixed(2)}`}</td>
    </tr>` : ''}
  </table>

  <div class="divider-double"></div>

  <!-- 9. GRAND TOTAL -->
  <table class="totals-table">
    <tr class="grand-total-row">
      <td style="width: 50%;">GRAND TOTAL:</td>
      <td class="text-right font-mono" style="width: 50%;">₹${Number(invoice.grand_total).toFixed(2)}</td>
    </tr>
  </table>

  <div class="divider-double"></div>

  <!-- 10. AMOUNT PAID & BALANCE DUE -->
  <table class="totals-table">
    <tr>
      <td style="width: 55%;">Payment Method:</td>
      <td class="text-right font-mono bold uppercase" style="width: 45%;">${invoice.payment_method}</td>
    </tr>
    <tr>
      <td>Amount Paid:</td>
      <td class="text-right font-mono bold">₹${Number(invoice.amount_paid).toFixed(2)}</td>
    </tr>
    <tr>
      <td class="${invoice.balance_due > 0 ? 'bold' : ''}">Balance Due:</td>
      <td class="text-right font-mono bold">${invoice.balance_due > 0 ? `₹${Number(invoice.balance_due).toFixed(2)}` : '₹0.00'}</td>
    </tr>
  </table>

  <!-- 11. QR CODE (SIMPLE & CLEAN: ONLY THE QR IMAGE, CENTERED, NO BORDER, NO TEXT) -->
  ${qrDataUrl ? `
  <div class="qr-container">
    <img src="${qrDataUrl}" alt="QR" class="qr-image" />
  </div>
  ` : ''}

  <div class="divider"></div>

  <!-- 12. THANK-YOU MESSAGE -->
  <div class="text-center bold" style="font-size: ${fontSizeBase}; margin: 4px 0 2px 0;">
    THANK YOU FOR SHOPPING WITH US!
  </div>
  <div class="text-center bold" style="font-size: ${fontSizeSub};">
    *** VISIT AGAIN ***
  </div>

  ${shop.footer_text ? `
  <div class="footer-note">
    ${shop.footer_text}
  </div>` : ''}

  <div class="divider"></div>
  <div class="text-center" style="font-size: 8px; color: #555;">
    Printed on ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
  </div>

</body>
</html>
  `.trim();
}

/**
 * Print receipt using an isolated hidden iframe
 * Guarantees zero pollution from main document, no A4 page breaks, exact thermal dimensions!
 */
export async function printThermalReceipt({
  invoice,
  shop,
  paperWidth = '80mm',
  qrMode = 'dynamic'
}: {
  invoice: Invoice;
  shop: ShopSettings;
  paperWidth?: ThermalPaperWidth;
  qrMode?: QrCodeMode;
}): Promise<void> {
  const qrRes = await getReceiptQrCodeDataUrl({ invoice, shop, mode: qrMode });
  const html = generateThermalReceiptHtml({
    invoice,
    shop,
    paperWidth,
    qrDataUrl: qrRes.qrUrl
  });

  return new Promise((resolve) => {
    // Create hidden printing iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'thermal-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.left = '-9999px';
    iframe.style.top = '0';
    iframe.style.width = paperWidth === '58mm' ? '220px' : '320px';
    iframe.style.height = '600px';
    iframe.style.border = 'none';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
      window.print();
      return resolve();
    }

    doc.open();
    doc.write(html);
    doc.close();

    const triggerPrint = async () => {
      try {
        // Wait for document fonts if available
        if (doc.fonts && typeof doc.fonts.ready === 'object') {
          await doc.fonts.ready.catch(() => {});
        }

        // Wait for all images (especially QR) to load and decode
        const images = Array.from(doc.images);
        await Promise.all(images.map((img) => {
          if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
          return new Promise<void>((imgResolve) => {
            img.onload = () => imgResolve();
            img.onerror = () => imgResolve();
            setTimeout(imgResolve, 1500);
          });
        }));

        await new Promise((r) => setTimeout(r, 200));

        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Error during thermal printing execution:', err);
        window.print();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          resolve();
        }, 1500);
      }
    };

    setTimeout(triggerPrint, 100);
  });
}

/**
 * Download authentic thermal receipt PDF (custom roll width, dynamic height)
 */
export async function downloadThermalReceiptPdf({
  element,
  invoice,
  paperWidth = '80mm'
}: {
  element: HTMLElement;
  invoice: Invoice;
  paperWidth: ThermalPaperWidth;
}): Promise<void> {
  const is58mm = paperWidth === '58mm';
  const widthMm = is58mm ? 58 : 80;

  // Make sure all images inside element are fully loaded
  const imgs = Array.from(element.querySelectorAll('img'));
  await Promise.all(imgs.map((img) => {
    if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
    return new Promise<void>((res) => {
      img.onload = () => res();
      img.onerror = () => res();
      setTimeout(res, 1500);
    });
  }));

  // Render element using html2canvas with high scale for thermal sharpness
  const canvas = await html2canvas(element, {
    scale: 3,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false
  });

  const imgData = canvas.toDataURL('image/png');
  const imgWidthMm = widthMm;
  const imgHeightMm = (canvas.height * widthMm) / canvas.width;

  // Custom thermal page size matching exact receipt height (no A4!)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [imgWidthMm, imgHeightMm]
  });

  pdf.addImage(imgData, 'PNG', 0, 0, imgWidthMm, imgHeightMm, undefined, 'FAST');
  pdf.save(`Receipt_${invoice.invoice_number}_${paperWidth}.pdf`);
}
