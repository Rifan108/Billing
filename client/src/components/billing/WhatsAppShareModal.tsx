import React, { useState, useEffect } from 'react';
import {
  X,
  MessageCircle,
  Download,
  Share2,
  CheckCircle2,
  AlertCircle,
  FileText,
  ExternalLink,
  Loader2,
  Copy,
  Check
} from 'lucide-react';
import api from '../../services/api';
import { Invoice, ShopSettings } from '../../types';
import {
  normalizeIndianPhone,
  buildInvoiceWhatsAppMessage,
  canNativeShareFiles,
  sharePdfViaNative,
  downloadBlobAsFile,
  generateInvoicePdf
} from '../../services/whatsappInvoiceService';

interface WhatsAppShareModalProps {
  isOpen: boolean;
  invoice: Invoice;
  shop?: ShopSettings;
  receiptElement?: HTMLElement | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  isOpen,
  invoice,
  shop: propShop,
  receiptElement,
  onClose,
  onSuccess
}) => {
  const shop: ShopSettings = propShop || invoice.shop || {
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
    terms_conditions: ''
  };

  const [phoneInput, setPhoneInput] = useState<string>('');
  const [savePhone, setSavePhone] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showDesktopSteps, setShowDesktopSteps] = useState<boolean>(false);
  const [downloadedFilename, setDownloadedFilename] = useState<string>('');
  const [whatsappWebUrl, setWhatsappWebUrl] = useState<string>('');
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [nativeShareSuccess, setNativeShareSuccess] = useState<boolean>(false);
  const [cachedBlob, setCachedBlob] = useState<Blob | null>(null);

  const nativeSupport = canNativeShareFiles();

  // Initialize phone from invoice on open
  useEffect(() => {
    if (isOpen) {
      const initial = invoice.customer_phone || '';
      setPhoneInput(initial);
      setErrorMsg('');
      setShowDesktopSteps(false);
      setNativeShareSuccess(false);
      setCachedBlob(null);
    }
  }, [isOpen, invoice]);

  if (!isOpen) return null;

  const phoneValidation = normalizeIndianPhone(phoneInput);
  const messagePreview = buildInvoiceWhatsAppMessage(invoice, shop.shop_name);

  const handleShare = async () => {
    if (!phoneValidation.isValid) {
      setErrorMsg(phoneValidation.error || 'Please enter a valid 10-digit Indian mobile number');
      return;
    }

    setErrorMsg('');
    setLoading(true);

    try {
      // 1. Fetch full invoice if items are missing
      let fullInvoice = invoice;
      if (!invoice.items || invoice.items.length === 0 || !invoice.shop) {
        setLoadingStep('Retrieving full invoice details...');
        try {
          const invRes = await api.get(`/invoices/${invoice.id}`);
          if (invRes.data) {
            fullInvoice = invRes.data;
          }
        } catch (e) {
          console.warn('Could not fetch full invoice, proceeding with existing data', e);
        }
      }

      // 2. Generate high-resolution PDF
      setLoadingStep('Generating high-resolution invoice PDF...');
      const { blob, file, filename } = await generateInvoicePdf({
        invoice: fullInvoice,
        shop,
        sourceElement: receiptElement
      });
      setCachedBlob(blob);
      setDownloadedFilename(filename);

      // 3. Register / update phone on server and log share
      setLoadingStep('Preparing WhatsApp link...');
      let serverData: any = null;
      try {
        const res = await api.get(
          `/invoices/${invoice.id}/whatsapp?phone=${encodeURIComponent(phoneValidation.digits)}`
        );
        serverData = res.data;
      } catch (e) {
        console.warn('Failed to log WhatsApp share on server', e);
      }

      const webUrl =
        serverData?.whatsappWebUrl ||
        `https://web.whatsapp.com/send?phone=${phoneValidation.international}&text=${encodeURIComponent(
          messagePreview
        )}`;
      const fallbackUrl =
        serverData?.whatsappUrl ||
        `https://wa.me/${phoneValidation.international}?text=${encodeURIComponent(messagePreview)}`;

      setWhatsappWebUrl(webUrl);

      // 4. Execute Native Share if supported (Mobile / Tablet / Compatible desktop)
      if (nativeSupport) {
        setLoadingStep('Opening native share sheet...');
        const shareResult = await sharePdfViaNative({
          file,
          title: `Tax Invoice ${invoice.invoice_number}`,
          text: messagePreview
        });

        if (shareResult.completed) {
          setNativeShareSuccess(true);
          onSuccess?.();
          setTimeout(() => {
            onClose();
          }, 2000);
          return;
        } else if (shareResult.cancelled) {
          // User dismissed the share dialog
          setLoading(false);
          setLoadingStep('');
          return;
        }
      }

      // 5. Desktop / Non-native fallback: Download PDF + Launch WhatsApp Web + Show guidance
      setLoadingStep('Downloading invoice PDF...');
      downloadBlobAsFile(blob, filename);

      // Attempt opening WhatsApp Web
      const openedWin = window.open(webUrl, '_blank');
      if (!openedWin) {
        // Pop-up blocker caught it; fallbackUrl or button in modal will open it
      }

      setShowDesktopSteps(true);
      onSuccess?.();
    } catch (err: any) {
      console.error('WhatsApp PDF share error:', err);
      setErrorMsg(err?.message || 'Could not share invoice. Please try again or download the PDF.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(messagePreview);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  const handleReDownload = () => {
    if (cachedBlob && downloadedFilename) {
      downloadBlobAsFile(cachedBlob, downloadedFilename);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-4 bg-emerald-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <MessageCircle className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Share Invoice on WhatsApp</h2>
              <p className="text-xs text-emerald-100 font-medium">
                Tax Invoice #{invoice.invoice_number}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4">

          {/* Success Banner (Native Share) */}
          {nativeShareSuccess && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-bold">Invoice PDF Shared Successfully!</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  The invoice document and summary message were handed to WhatsApp.
                </p>
              </div>
            </div>
          )}

          {/* Desktop Fallback Steps */}
          {showDesktopSteps && !nativeShareSuccess && (
            <div className="space-y-3.5">
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  PDF Downloaded & WhatsApp Web Ready
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Follow these 2 quick steps to complete sharing the PDF document:
                </p>
              </div>

              {/* Step by step guide */}
              <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                <div className="flex items-start gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                    1
                  </span>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">Invoice PDF Saved: </span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{downloadedFilename}</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Check your browser&apos;s Downloads folder.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                    2
                  </span>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">Send PDF in WhatsApp Web:</span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      In the open WhatsApp Web chat, click the <strong>attach icon (📎 paperclip / +)</strong> → select <strong>Document</strong> → pick <strong>{downloadedFilename}</strong> and press Send.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick actions for desktop */}
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <a
                  href={whatsappWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-[150px] flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all active:scale-95"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open WhatsApp Web Again
                </a>

                {cachedBlob && (
                  <button
                    onClick={handleReDownload}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF Again
                  </button>
                )}

                <button
                  onClick={handleCopyMessage}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-xl text-xs transition-all cursor-pointer"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedText ? 'Copied!' : 'Copy Text'}
                </button>
              </div>
            </div>
          )}

          {/* Standard Input Form (Before sharing or when retrying) */}
          {!showDesktopSteps && !nativeShareSuccess && (
            <>
              {/* Invoice Quick Summary Card */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Customer</span>
                    <span className="font-bold text-slate-900 dark:text-white truncate block">
                      {invoice.customer_name || 'Walk-in Customer'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[11px]">Grand Total</span>
                    <span className="font-black font-mono text-emerald-700 dark:text-emerald-400 text-sm">
                      ₹{Number(invoice.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Date</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {invoice.invoice_date} {invoice.invoice_time ? `• ${invoice.invoice_time}` : ''}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 block text-[11px]">Balance Due</span>
                    <span className={`font-mono font-bold ${invoice.balance_due > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {invoice.balance_due > 0 ? `₹${Number(invoice.balance_due).toFixed(2)}` : 'Fully Paid'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Customer Mobile Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Customer WhatsApp Number <span className="text-red-500">*</span>
                </label>
                <div className="relative flex rounded-xl shadow-xs overflow-hidden border border-slate-300 dark:border-slate-700 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500">
                  <span className="inline-flex items-center px-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold border-r border-slate-300 dark:border-slate-700 select-none">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => {
                      setPhoneInput(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="98765 43210"
                    maxLength={14}
                    autoFocus={!invoice.customer_phone}
                    className="flex-1 px-3 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-hidden"
                  />
                  {phoneValidation.isValid && (
                    <div className="flex items-center pr-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                  )}
                </div>

                {/* Validation message */}
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  {phoneValidation.isValid ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                      Valid WhatsApp Number: {phoneValidation.display}
                    </span>
                  ) : phoneInput.trim() ? (
                    <span className="text-red-600 dark:text-red-400">
                      {phoneValidation.error || 'Please enter a 10-digit Indian mobile number'}
                    </span>
                  ) : (
                    <span className="text-slate-500">
                      Enter 10-digit Indian mobile number (e.g. 9842155678)
                    </span>
                  )}
                </div>
              </div>

              {/* Message Preview */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Message Preview
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    {copiedText ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedText ? 'Copied' : 'Copy Text'}
                  </button>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-line max-h-32 overflow-y-auto leading-relaxed">
                  {messagePreview}
                </div>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl flex items-center gap-2 text-red-700 dark:text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  disabled={loading || !phoneValidation.isValid}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{loadingStep || 'Processing...'}</span>
                    </>
                  ) : nativeSupport ? (
                    <>
                      <Share2 className="w-4 h-4" />
                      <span>Share Invoice PDF to WhatsApp</span>
                    </>
                  ) : (
                    <>
                      <MessageCircle className="w-4 h-4" />
                      <span>Download PDF & Open WhatsApp</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Close button when in success or desktop step */}
          {(showDesktopSteps || nativeShareSuccess) && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Done / Close
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
