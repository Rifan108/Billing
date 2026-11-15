import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Invoice, ShopSettings } from '../types';
import { getReceiptQrCodeDataUrl } from '../utils/thermalPrinter';

export interface PhoneValidationResult {
  isValid: boolean;
  raw: string;
  digits: string;        // 10 digits e.g. "9842155678"
  international: string; // 12 digits with 91 prefix e.g. "919842155678"
  display: string;       // Formatted e.g. "+91 98421 55678"
  error?: string;
}

/**
 * Validates and normalizes Indian mobile numbers (+91, 10 digits starting with 6-9)
 */
export function normalizeIndianPhone(rawPhone?: string | null): PhoneValidationResult {
  if (!rawPhone || !rawPhone.trim()) {
    return {
      isValid: false,
      raw: '',
      digits: '',
      international: '',
      display: '',
      error: 'Customer mobile number is required'
    };
  }

  const raw = rawPhone.trim();
  let digits = raw.replace(/\D/g, '');

  // Strip leading 0 or 91 country prefix
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  if (digits.length !== 10) {
    return {
      isValid: false,
      raw,
      digits,
      international: '',
      display: raw,
      error: `Invalid number: expected 10 digits, got ${digits.length}`
    };
  }

  if (!/^[6-9]/.test(digits)) {
    return {
      isValid: false,
      raw,
      digits,
      international: '',
      display: raw,
      error: 'Invalid Indian mobile number: should start with 6, 7, 8, or 9'
    };
  }

  return {
    isValid: true,
    raw,
    digits,
    international: `91${digits}`,
    display: `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
  };
}

/**
 * Builds the professional WhatsApp message for an invoice
 */
export function buildInvoiceWhatsAppMessage(invoice: Invoice, shopName?: string): string {
  const shop = (shopName || invoice.shop?.shop_name || 'Sri Lakshmi Silks & Textiles').trim();
  const formattedTotal = Number(invoice.grand_total).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const balanceDue = Number(invoice.balance_due || 0);

  const lines = [
    `Thank you for shopping with us!`,
    ``,
    `Your invoice ${invoice.invoice_number} is ready.`,
    ``,
    `Total Amount: ₹${formattedTotal}`,
    balanceDue > 0
      ? `Balance Due: ₹${balanceDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `Payment Status: Paid`,
    ``,
    `Thank you for choosing ${shop}!`
  ];

  return lines.join('\n');
}

/**
 * Checks if the browser supports sharing files (PDF) via the native Web Share API
 */
export function canNativeShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
    return false;
  }
  try {
    const dummyFile = new File([''], 'sample.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [dummyFile] });
  } catch {
    return false;
  }
}

/**
 * Triggers native OS share sheet with the actual PDF file
 */
export async function sharePdfViaNative({
  file,
  title,
  text
}: {
  file: File;
  title: string;
  text: string;
}): Promise<{ completed: boolean; cancelled?: boolean }> {
  if (!canNativeShareFiles()) {
    throw new Error('Native file sharing is not supported on this browser');
  }

  try {
    await navigator.share({
      files: [file],
      title,
      text
    });
    return { completed: true };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { completed: false, cancelled: true };
    }
    throw err;
  }
}

/**
 * Programmatically downloads a blob as a file on desktop / fallback
 */
export function downloadBlobAsFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Generates an authentic, high-resolution PDF for the invoice.
 * If sourceElement is passed (e.g. active receipt DOM node), renders that directly.
 * Otherwise, dynamically renders a clean, self-contained invoice template offscreen.
 */
export async function generateInvoicePdf({
  invoice,
  shop,
  sourceElement
}: {
  invoice: Invoice;
  shop: ShopSettings;
  sourceElement?: HTMLElement | null;
}): Promise<{
  blob: Blob;
  file: File;
  filename: string;
  dataUrl: string;
}> {
  let targetElement: HTMLElement;
  let cleanupElement: HTMLElement | null = null;

  if (sourceElement) {
    targetElement = sourceElement;
  } else {
    // Dynamically build clean off-screen receipt container
    const offscreenContainer = document.createElement('div');
    offscreenContainer.style.position = 'fixed';
    offscreenContainer.style.left = '-9999px';
    offscreenContainer.style.top = '0';
    offscreenContainer.style.width = '360px';
    offscreenContainer.style.backgroundColor = '#ffffff';
    offscreenContainer.style.color = '#000000';
    offscreenContainer.style.fontFamily = 'monospace';
    offscreenContainer.style.fontSize = '11.5px';
    offscreenContainer.style.lineHeight = '1.25';
    offscreenContainer.style.padding = '16px';
    offscreenContainer.style.zIndex = '-1000';

    // Get QR Data URL if possible
    let qrImgHtml = '';
    try {
      const qrRes = await getReceiptQrCodeDataUrl({ invoice, shop, mode: shop.qr_mode || 'dynamic' });
      if (qrRes?.qrUrl) {
        qrImgHtml = `<div style="text-align: center; margin: 12px 0 6px 0;"><img src="${qrRes.qrUrl}" alt="UPI QR" style="width: 140px; height: 140px; display: inline-block;" /></div>`;
      }
    } catch (e) {
      // QR optional in offline rendering
    }

    const items = invoice.items || [];
    const itemsHtml = items.map(item => `
      <div style="margin-bottom: 6px;">
        <div style="font-weight: bold; font-size: 11px;">${item.product_name} ${item.variant_name ? `(${item.variant_name})` : ''}</div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #333;">
          <span>HSN: ${item.hsn_code || '-'} (${item.gst_rate}%)</span>
          <span>${item.quantity} ${item.unit || 'Pcs'} x ₹${Number(item.rate).toFixed(2)}</span>
          <span style="font-weight: bold; color: #000;">₹${Number(item.final_amount || (item.quantity * item.rate)).toFixed(2)}</span>
        </div>
      </div>
    `).join('');

    offscreenContainer.innerHTML = `
      <div style="text-align: center; margin-bottom: 8px;">
        <h2 style="font-size: 15px; font-weight: 900; text-transform: uppercase; margin: 0;">${shop.shop_name}</h2>
        ${shop.tagline ? `<p style="font-size: 9px; color: #444; margin: 2px 0;">${shop.tagline}</p>` : ''}
        <p style="font-size: 9px; margin: 2px 0;">${shop.address}, ${shop.city} - ${shop.pincode}</p>
        <p style="font-size: 9px; margin: 2px 0;">Ph: ${shop.contact_number} | GSTIN: ${shop.gstin}</p>
      </div>

      <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
      <div style="text-align: center; font-weight: bold; font-size: 10px; text-transform: uppercase;">
        TAX INVOICE (${invoice.is_inter_state ? 'INTER-STATE / IGST' : 'INTRA-STATE / GST'})
      </div>
      <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>

      <div style="font-size: 10px; margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="font-weight: bold;">Bill No: ${invoice.invoice_number}</span>
          <span>Date: ${invoice.invoice_date}</span>
        </div>
        <div style="display: flex; justify-content: space-between; color: #444;">
          <span>Time: ${invoice.invoice_time || ''}</span>
          <span>Place: ${invoice.place_of_supply || shop.state}</span>
        </div>
        <div style="margin-top: 4px;">
          <span style="font-weight: bold;">Customer: </span>
          <span>${invoice.customer_name || 'Cash Customer'}</span>
          ${invoice.customer_phone ? ` (+91 ${invoice.customer_phone})` : ''}
        </div>
        ${invoice.customer_gstin ? `<div style="font-weight: bold; color: #1e1b4b;">GSTIN: ${invoice.customer_gstin}</div>` : ''}
      </div>

      <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
      <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 9px; text-transform: uppercase; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 6px;">
        <span>Item Details</span>
        <span>Qty & Rate</span>
        <span>Amount</span>
      </div>

      ${itemsHtml}

      <div style="border-bottom: 1px dashed #000; margin: 8px 0 4px 0;"></div>

      <div style="font-size: 10px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Subtotal:</span>
          <span>₹${Number(invoice.subtotal_raw || 0).toFixed(2)}</span>
        </div>
        ${invoice.total_bill_discount > 0 ? `
          <div style="display: flex; justify-content: space-between; color: #b91c1c;">
            <span>Discount:</span>
            <span>-₹${Number(invoice.total_bill_discount).toFixed(2)}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between;">
          <span>Taxable Value:</span>
          <span>₹${Number(invoice.total_taxable_amount || 0).toFixed(2)}</span>
        </div>
        ${invoice.is_inter_state ? `
          <div style="display: flex; justify-content: space-between;">
            <span>IGST:</span>
            <span>₹${Number(invoice.total_igst || 0).toFixed(2)}</span>
          </div>
        ` : `
          <div style="display: flex; justify-content: space-between;">
            <span>CGST:</span>
            <span>₹${Number(invoice.total_cgst || 0).toFixed(2)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>SGST:</span>
            <span>₹${Number(invoice.total_sgst || 0).toFixed(2)}</span>
          </div>
        `}
        <div style="border-bottom: 1px solid #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 900;">
          <span>GRAND TOTAL:</span>
          <span>₹${Number(invoice.grand_total).toFixed(2)}</span>
        </div>
        <div style="border-bottom: 1px solid #000; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>Paid (${(invoice.payment_method || 'cash').toUpperCase()}):</span>
          <span style="font-weight: bold; color: #047857;">₹${Number(invoice.amount_paid || 0).toFixed(2)}</span>
        </div>
        ${Number(invoice.balance_due || 0) > 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; color: #b91c1c;">
            <span>Balance Due:</span>
            <span>₹${Number(invoice.balance_due).toFixed(2)}</span>
          </div>
        ` : ''}
      </div>

      ${qrImgHtml}

      <div style="text-align: center; margin-top: 10px; font-size: 9px; color: #444;">
        <p style="font-weight: bold; margin: 2px 0;">${shop.footer_text || 'THANK YOU FOR SHOPPING WITH US! VISIT AGAIN!'}</p>
        <p style="font-size: 8px; margin: 2px 0;">Goods once sold can be exchanged within 7 days with bill.</p>
      </div>
    `;

    document.body.appendChild(offscreenContainer);
    targetElement = offscreenContainer;
    cleanupElement = offscreenContainer;
  }

  try {
    // Wait for any images to complete loading
    const imgs = Array.from(targetElement.querySelectorAll('img'));
    await Promise.all(
      imgs.map(img => {
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
        return new Promise<void>(res => {
          img.onload = () => res();
          img.onerror = () => res();
          setTimeout(res, 1200);
        });
      })
    );

    // High resolution capture
    const canvas = await html2canvas(targetElement, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');
    const widthMm = 80;
    const heightMm = Math.max(100, (canvas.height * widthMm) / canvas.width);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [widthMm, heightMm]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, widthMm, heightMm, undefined, 'FAST');

    const blob = pdf.output('blob');
    const filename = `Invoice_${invoice.invoice_number}.pdf`;
    const file = new File([blob], filename, {
      type: 'application/pdf',
      lastModified: Date.now()
    });

    return {
      blob,
      file,
      filename,
      dataUrl: imgData
    };
  } finally {
    if (cleanupElement && document.body.contains(cleanupElement)) {
      document.body.removeChild(cleanupElement);
    }
  }
}
