import React, { useRef, useState, useEffect } from 'react';
import {
  Printer,
  Download,
  X
} from 'lucide-react';
import { Invoice, ShopSettings } from '../../types';
import {
  ThermalPaperWidth,
  QrCodeMode,
  getReceiptQrCodeDataUrl,
  printThermalReceipt,
  downloadThermalReceiptPdf
} from '../../utils/thermalPrinter';

interface PrintableInvoiceProps {
  invoice: Invoice;
  onClose?: () => void;
  autoPrint?: boolean;
}

export const PrintableInvoice: React.FC<PrintableInvoiceProps> = ({
  invoice,
  onClose,
  autoPrint = false
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  const shop: ShopSettings = invoice.shop || {
    id: 1,
    shop_name: 'SRI LAKSHMI SILKS & TEXTILES',
    tagline: 'Pure Silks • Designer Sarees • Ready-made Garments • Wholesale & Retail',
    logo_url: '',
    address: 'Door No. 42/1, Mahatma Gandhi Road, Near Clock Tower',
    location: 'Commercial Center',
    city: 'Coimbatore',
    district: 'Coimbatore',
    state: 'Tamil Nadu',
    state_code: '33',
    pincode: '641001',
    contact_number: '+91 98421 55678',
    alt_contact: '+91 422 2345678',
    email: 'contact@srilakshmitextiles.in',
    gstin: '33AABCU9603R1ZM',
    invoice_prefix: 'SLT',
    invoice_starting_number: 1001,
    qr_code_url: '/uploads/default_upi_qr.jpg',
    upi_id: 'nawazrifan33@oksbi',
    upi_payee_name: 'Nawaz Rifan',
    thermal_paper_width: '80mm',
    qr_mode: 'dynamic',
    footer_text: 'Thank you for your business! Goods once sold can be exchanged within 7 days with bill in original condition.',
    terms_conditions: '1. All disputes subject to local jurisdiction.\n2. Goods once sold can be exchanged within 7 days with bill.\n3. Cut fabrics and altered garments cannot be exchanged.'
  };

  // State for paper width and QR mode
  const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>(
    shop.thermal_paper_width === '58mm' ? '58mm' : '80mm'
  );
  const [qrMode, setQrMode] = useState<QrCodeMode>(
    shop.qr_mode === 'static' ? 'static' : 'dynamic'
  );

  // Dynamic QR Code state
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrReady, setQrReady] = useState<boolean>(false);
  const [printing, setPrinting] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);

  // Remaining payable balance
  const remainingDue = typeof invoice.balance_due === 'number'
    ? invoice.balance_due
    : (invoice.grand_total - (invoice.amount_paid || 0));
  const isFullyPaid = remainingDue <= 0 && (invoice.payment_status === 'paid' || (invoice.amount_paid || 0) >= invoice.grand_total);
  const payableAmount = remainingDue > 0 ? remainingDue : (isFullyPaid ? 0 : invoice.grand_total);

  // Generate / update QR code whenever mode or invoice changes
  useEffect(() => {
    let isMounted = true;
    setQrReady(false);
    getReceiptQrCodeDataUrl({ invoice, shop, mode: qrMode })
      .then(res => {
        if (isMounted) {
          setQrDataUrl(res.qrUrl);
          setQrReady(true);
        }
      })
      .catch(err => {
        console.error('QR generation error:', err);
        if (isMounted) setQrReady(true);
      });

    return () => { isMounted = false; };
  }, [qrMode, invoice, shop]);

  // Handle auto-print if triggered by billing, ensuring QR is loaded first
  useEffect(() => {
    if (autoPrint && qrReady) {
      const timer = setTimeout(() => {
        handlePrint();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, qrReady]);

  // Execute clean thermal printing
  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printThermalReceipt({
        invoice,
        shop,
        paperWidth,
        qrMode
      });
    } catch (err) {
      console.error('Print error:', err);
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  // Download thermal receipt as authentic custom-dimension PDF
  const handleDownloadPdf = async () => {
    if (!receiptRef.current) return;
    setDownloading(true);
    try {
      await downloadThermalReceiptPdf({
        element: receiptRef.current,
        invoice,
        paperWidth
      });
    } catch (err) {
      console.error('PDF error:', err);
      alert('Could not generate PDF. Please use the Print button.');
    } finally {
      setDownloading(false);
    }
  };

  const is58mm = paperWidth === '58mm';
  const items = invoice.items || [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static print:inset-auto">
      
      {/* FLOATING ACTION TOOLBAR (Hidden in print) */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center justify-center gap-2 bg-slate-900/95 text-white p-2 sm:px-4 sm:py-2.5 rounded-2xl shadow-2xl backdrop-blur-md border border-slate-700 no-print max-w-[95vw]">
        
        {/* Paper Width Toggle: 80mm vs 58mm */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl text-xs">
          <span className="text-[11px] font-semibold text-slate-400 pl-1.5 pr-1">Width:</span>
          <button
            onClick={() => setPaperWidth('80mm')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              paperWidth === '80mm'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            80mm (Standard)
          </button>
          <button
            onClick={() => setPaperWidth('58mm')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
              paperWidth === '58mm'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            58mm (Compact)
          </button>
        </div>

        {/* Print Receipt Button */}
        <button
          onClick={handlePrint}
          disabled={printing}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          {printing ? 'Printing...' : 'Print Thermal Receipt'}
        </button>

        {/* Download PDF Button */}
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-semibold rounded-xl text-xs transition-all border border-slate-700 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          {downloading ? 'PDF...' : 'PDF'}
        </button>

        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors ml-1 cursor-pointer"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        )}

      </div>

      {/* THERMAL PAPER ROLL PREVIEW CONTAINER */}
      <div className="mt-16 sm:mt-18 mb-8 flex flex-col items-center justify-center w-full">
        
        {/* Dynamic Paper Width Container with Tear Edge styling */}
        <div
          className={`bg-white text-black shadow-2xl transition-all duration-200 rounded-xs overflow-hidden relative ${
            is58mm ? 'w-[250px] sm:w-[260px]' : 'w-[330px] sm:w-[360px]'
          }`}
          style={{
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)'
          }}
        >
          
          {/* Top Zig-Zag Paper Tear Edge */}
          <div
            className="h-2 w-full bg-slate-200"
            style={{
              clipPath: 'polygon(0% 0%, 5% 100%, 10% 0%, 15% 100%, 20% 0%, 25% 100%, 30% 0%, 35% 100%, 40% 0%, 45% 100%, 50% 0%, 55% 100%, 60% 0%, 65% 100%, 70% 0%, 75% 100%, 80% 0%, 85% 100%, 90% 0%, 95% 100%, 100% 0%)'
            }}
          />

          {/* Actual Thermal Receipt Canvas */}
          <div
            ref={receiptRef}
            id="thermal-printable-receipt"
            className="p-3 sm:p-4 bg-white text-black font-mono select-text"
            style={{
              fontSize: is58mm ? '10px' : '11.5px',
              lineHeight: '1.25'
            }}
          >
            {/* STORE HEADER */}
            <div className="text-center pb-2">
              {shop.logo_url && (
                <img
                  src={shop.logo_url}
                  alt="Shop Logo"
                  className="w-12 h-12 object-contain mx-auto mb-1"
                />
              )}
              <h2
                className="font-black uppercase tracking-tight text-black"
                style={{ fontSize: is58mm ? '13px' : '15px' }}
              >
                {shop.shop_name}
              </h2>
              {shop.tagline && (
                <p className="text-[9px] text-slate-700 mt-0.5">{shop.tagline}</p>
              )}
              <p className="text-[9px] text-slate-800 leading-tight mt-0.5">
                {shop.address}, {shop.city} - {shop.pincode}
              </p>
              <p className="text-[9px] text-slate-900 mt-0.5">
                Ph: {shop.contact_number}{shop.alt_contact ? ` / ${shop.alt_contact}` : ''}
              </p>
              <p className="text-[10px] font-bold text-black mt-0.5">
                GSTIN: {shop.gstin}
              </p>
            </div>

            {/* DASHED SEPARATOR */}
            <div className="border-b border-dashed border-black my-1.5" />

            {/* RECEIPT TITLE & TYPE */}
            <div className="text-center font-bold uppercase text-[9px] tracking-wider">
              TAX INVOICE ({invoice.is_inter_state ? 'INTER-STATE / IGST' : 'INTRA-STATE / GST'})
            </div>

            <div className="border-b border-dashed border-black my-1.5" />

            {/* INVOICE & CUSTOMER METADATA */}
            <div className="space-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span className="font-bold">Bill No: {invoice.invoice_number}</span>
                <span>Date: {invoice.invoice_date}</span>
              </div>
              <div className="flex justify-between text-slate-800">
                <span>Time: {invoice.invoice_time}</span>
                <span>Place: {invoice.place_of_supply}</span>
              </div>
              <div className="pt-0.5">
                <span className="font-bold">Customer: </span>
                <span className="uppercase">{invoice.customer_name || 'Cash Customer'}</span>
              </div>
              {invoice.customer_phone && (
                <div>
                  <span>Mobile: </span>
                  <span>+91 {invoice.customer_phone}</span>
                </div>
              )}
              {invoice.customer_gstin && (
                <div className="font-bold text-indigo-900">
                  <span>GSTIN: {invoice.customer_gstin}</span>
                </div>
              )}
            </div>

            <div className="border-b border-dashed border-black my-1.5" />

            {/* PRODUCTS TABLE */}
            <div className="my-1">
              {/* Header */}
              <div className="flex justify-between font-bold text-[9px] uppercase border-b border-dashed border-black pb-1 mb-1">
                <span className="w-1/2 text-left">Item</span>
                <span className="w-1/6 text-center">Qty</span>
                <span className="w-1/6 text-right">Rate</span>
                <span className="w-1/6 text-right">Amt</span>
              </div>

              {/* Rows */}
              <div className="space-y-1.5">
                {items.map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    {/* Item Name */}
                    <div className="font-bold text-[10px] text-black leading-tight">
                      {item.product_name}
                    </div>
                    {/* Item details row */}
                    <div className="flex justify-between text-[10px] items-baseline">
                      <span className="w-1/2 text-[9px] text-slate-700">
                        HSN:{item.hsn_code} ({item.gst_rate}%)
                      </span>
                      <span className="w-1/6 text-center font-bold">
                        {item.quantity} {item.unit?.slice(0, 3) || 'Pcs'}
                      </span>
                      <span className="w-1/6 text-right">
                        {Number(item.rate).toFixed(2)}
                      </span>
                      <span className="w-1/6 text-right font-black">
                        {Number(item.final_amount).toFixed(2)}
                      </span>
                    </div>
                    {/* Discount note if present */}
                    {item.discount_amount > 0 && (
                      <div className="text-right text-[8.5px] text-slate-600">
                        Discount: -₹{Number(item.discount_amount).toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-b border-dashed border-black my-1.5" />

            {/* BILL SUMMARY & GST BREAKDOWN */}
            <div className="space-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span>Total Items / Qty:</span>
                <span>{invoice.total_items_count} items</span>
              </div>
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₹{Number(invoice.subtotal_raw).toFixed(2)}</span>
              </div>

              {(invoice.total_product_discount + invoice.total_bill_discount) > 0 && (
                <div className="flex justify-between text-slate-800">
                  <span>Total Discount:</span>
                  <span>-₹{Number(invoice.total_product_discount + invoice.total_bill_discount).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>Taxable Amount:</span>
                <span>₹{Number(invoice.total_taxable_amount).toFixed(2)}</span>
              </div>

              {!invoice.is_inter_state ? (
                <>
                  <div className="flex justify-between text-slate-800 text-[9px]">
                    <span>CGST:</span>
                    <span>₹{Number(invoice.total_cgst).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-800 text-[9px]">
                    <span>SGST:</span>
                    <span>₹{Number(invoice.total_sgst).toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-slate-800 text-[9px]">
                  <span>IGST (Inter-State):</span>
                  <span>₹{Number(invoice.total_igst).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between">
                <span>Total GST:</span>
                <span>₹{Number(invoice.total_tax_amount).toFixed(2)}</span>
              </div>

              {invoice.round_off !== 0 && (
                <div className="flex justify-between text-[9px] text-slate-700">
                  <span>Round Off:</span>
                  <span>{invoice.round_off > 0 ? `+₹${invoice.round_off.toFixed(2)}` : `-₹${Math.abs(invoice.round_off).toFixed(2)}`}</span>
                </div>
              )}
            </div>

            {/* SOLID DOUBLE DIVIDER */}
            <div className="border-b-2 border-black my-1.5" />

            {/* GRAND TOTAL ROW */}
            <div className="flex justify-between items-center py-0.5 font-black text-black" style={{ fontSize: is58mm ? '13px' : '15px' }}>
              <span>NET TOTAL:</span>
              <span>₹{Number(invoice.grand_total).toFixed(2)}</span>
            </div>

            <div className="border-b-2 border-black my-1.5" />

            {/* PAYMENT DETAILS */}
            <div className="space-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span>Payment Mode:</span>
                <span className="font-bold uppercase">{invoice.payment_method}</span>
              </div>
              <div className="flex justify-between">
                <span>Amount Paid:</span>
                <span className="font-bold">₹{Number(invoice.amount_paid).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Balance Due:</span>
                <span>{invoice.balance_due > 0 ? `₹${Number(invoice.balance_due).toFixed(2)}` : '₹0.00'}</span>
              </div>
            </div>

            {/* 11. QR CODE (ONLY THE QR CODE IMAGE, CENTERED, NO BORDER, NO TEXT) */}
            {qrDataUrl && (
              <div className="text-center my-2.5 py-0">
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="mx-auto block"
                  style={{
                    width: is58mm ? '105px' : '130px',
                    height: is58mm ? '105px' : '130px',
                    objectFit: 'contain',
                    border: 'none',
                    padding: 0,
                    imageRendering: 'crisp-edges'
                  }}
                />
              </div>
            )}

            {/* MANDATORY GREETINGS & FOOTER */}
            <div className="border-t border-dashed border-black mt-2 pt-2 text-center space-y-0.5">
              <div className="font-black uppercase text-[10px] tracking-wider">
                THANK YOU FOR SHOPPING WITH US!
              </div>
              <div className="font-bold text-[9px]">
                *** VISIT AGAIN ***
              </div>
              <p className="text-[8px] text-slate-700 mt-1 leading-tight">
                {shop.footer_text || 'Goods once sold can be exchanged within 7 days with bill in original condition.'}
              </p>
            </div>

            {/* Bottom timestamp */}
            <div className="text-center text-[7.5px] text-slate-500 mt-2 border-t border-dotted border-slate-400 pt-1">
              Printed on {new Date().toLocaleDateString('en-IN')} {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} • Powered by Textile POS
            </div>

          </div>

          {/* Bottom Zig-Zag Paper Tear Edge */}
          <div
            className="h-2 w-full bg-slate-200"
            style={{
              clipPath: 'polygon(0% 100%, 5% 0%, 10% 100%, 15% 0%, 20% 100%, 25% 0%, 30% 100%, 35% 0%, 40% 100%, 45% 0%, 50% 100%, 55% 0%, 60% 100%, 65% 0%, 70% 100%, 75% 0%, 80% 100%, 85% 0%, 90% 100%, 95% 0%, 100% 100%)'
            }}
          />

        </div>

      </div>

    </div>
  );
};
