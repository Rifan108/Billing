import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  Search,
  Plus,
  Printer,
  CheckCircle2,
  AlertCircle,
  Eye,
  ArrowRightLeft,
  Calendar,
  User,
  Package,
  Receipt,
  X,
  Layers
} from 'lucide-react';
import api, { generateIdempotencyKey } from '../services/api';
import { ReturnTransaction, ReturnItem, Invoice, Product } from '../types';

export const ReturnsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'history' | 'new'>('history');
  const [returnsList, setReturnsList] = useState<ReturnTransaction[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New Return Workflow State
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [searchingInvoice, setSearchingInvoice] = useState(false);
  const [originalInvoice, setOriginalInvoice] = useState<Invoice | null>(null);
  const [returnType, setReturnType] = useState<'return' | 'exchange'>('return');
  const [returnReason, setReturnReason] = useState('Wrong Size / Fit');
  const [refundMethod, setRefundMethod] = useState('cash');
  const [notes, setNotes] = useState('');

  // Selected items to return
  const [selectedReturnItems, setSelectedReturnItems] = useState<{
    [itemId: number]: {
      selected: boolean;
      return_qty: number;
      condition: 'undamaged' | 'damaged';
    }
  }>({});

  // Exchange items (new products being taken)
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [exchangeItems, setExchangeItems] = useState<{
    product_id: number;
    variant_id?: number;
    product_name: string;
    variant_name?: string;
    quantity: number;
    selling_price: number;
    line_total: number;
  }[]>([]);

  // Receipt Modal
  const [activeReceipt, setActiveReceipt] = useState<ReturnTransaction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const [retRes, prodRes] = await Promise.all([
        api.get('/returns'),
        api.get('/products')
      ]);
      setReturnsList(retRes.data.returns || []);
      setSummary(retRes.data.summary || null);
      setCatalogProducts(prodRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  // Lookup Original Invoice
  const handleLookupInvoice = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = invoiceSearchQuery.trim();
    if (!query) return;

    setSearchingInvoice(true);
    setFeedbackMsg(null);
    try {
      const res = await api.get(`/returns/lookup-invoice/${encodeURIComponent(query)}`);
      setOriginalInvoice(res.data);
      // Initialize return items map
      const initialMap: any = {};
      (res.data.items || []).forEach((item: any) => {
        const itemId = item.id || 0;
        const eligible = Math.max(0, item.quantity - (item.returned_quantity || 0));
        initialMap[itemId] = {
          selected: false,
          return_qty: eligible > 0 ? 1 : 0,
          condition: 'undamaged'
        };
      });
      setSelectedReturnItems(initialMap);
      setExchangeItems([]);
    } catch (err: any) {
      setOriginalInvoice(null);
      setFeedbackMsg({ type: 'error', text: err.response?.data?.error || `Invoice "${query}" not found.` });
    } finally {
      setSearchingInvoice(false);
    }
  };

  // Calculations for Returns
  const itemsToReturnList = (originalInvoice?.items || []).filter(item => {
    const itemId = item.id || 0;
    const sel = selectedReturnItems[itemId];
    return sel && sel.selected && sel.return_qty > 0;
  });

  const totalRefundAmount = itemsToReturnList.reduce((sum, item) => {
    const itemId = item.id || 0;
    const sel = selectedReturnItems[itemId];
    const qty = sel?.return_qty || 0;
    const unitRate = Number(item.rate) || 0;
    const discountPerUnit = (Number(item.discount_amount) || 0) / (Number(item.quantity) || 1);
    const netRate = Math.max(0, unitRate - discountPerUnit);
    const gstRate = Number(item.gst_rate) || 0;
    const itemTotal = netRate * qty * (item.is_tax_inclusive ? 1 : (1 + gstRate / 100));
    return sum + Math.round(itemTotal * 100) / 100;
  }, 0);

  // Calculations for Exchanges
  const totalExchangeAmount = exchangeItems.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0);
  const netAmountPayable = Math.round((totalExchangeAmount - totalRefundAmount) * 100) / 100;

  // Add Item to Exchange list
  const handleAddExchangeItem = () => {
    const defaultP = catalogProducts[0];
    if (!defaultP) return;
    setExchangeItems(prev => [
      ...prev,
      {
        product_id: defaultP.id,
        variant_id: undefined,
        product_name: defaultP.name,
        variant_name: '',
        quantity: 1,
        selling_price: defaultP.selling_price || 500,
        line_total: (defaultP.selling_price || 500) * 1
      }
    ]);
  };

  const updateExchangeItem = (index: number, fields: any) => {
    setExchangeItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], ...fields };
      if (fields.product_id) {
        const prod = catalogProducts.find(p => p.id === Number(fields.product_id));
        if (prod) {
          item.product_name = prod.name;
          item.selling_price = prod.selling_price || 0;
        }
      }
      item.line_total = (Number(item.quantity) || 1) * (Number(item.selling_price) || 0);
      updated[index] = item;
      return updated;
    });
  };

  const removeExchangeItem = (index: number) => {
    setExchangeItems(prev => prev.filter((_, i) => i !== index));
  };

  // Process Return / Exchange
  const handleProcessReturn = async () => {
    if (submitting) return; // Strict double-click prevention
    if (!originalInvoice) return;
    if (itemsToReturnList.length === 0) {
      alert('Please select at least one product to return.');
      return;
    }
    if (returnType === 'exchange' && exchangeItems.length === 0) {
      alert('Please add at least one replacement exchange item or switch to Return Only.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        invoice_id: originalInvoice.id,
        return_type: returnType,
        reason: returnReason,
        condition: 'undamaged',
        refund_method: refundMethod,
        items: itemsToReturnList.map(item => {
          const itemId = item.id || 0;
          const sel = selectedReturnItems[itemId];
          return {
            invoice_item_id: item.id,
            product_id: item.product_id,
            variant_id: item.variant_id,
            quantity_returned: sel?.return_qty || 1,
            condition: sel?.condition || 'undamaged'
          };
        }),
        exchange_items: returnType === 'exchange' ? exchangeItems : [],
        notes
      };

      const res = await api.post('/returns', payload, {
        headers: {
          'Idempotency-Key': generateIdempotencyKey()
        }
      });
      setFeedbackMsg({ type: 'success', text: `Return ${res.data.return_number} processed successfully!` });
      setActiveReceipt(res.data);
      // Reset new return form
      setOriginalInvoice(null);
      setInvoiceSearchQuery('');
      setSelectedReturnItems({});
      setExchangeItems([]);
      fetchReturns();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to process return.');
    } finally {
      setSubmitting(false);
    }
  };

  // Print Return / Exchange Receipt
  const handlePrintReturnReceipt = (receipt: ReturnTransaction) => {
    const printWindow = window.open('', '_blank', 'width=450,height=650');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Return Receipt - ${receipt.return_number}</title>
        <style>
          body { font-family: monospace; margin: 16px; font-size: 11.5px; line-height: 1.35; color: #000; }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
          .title { font-size: 15px; font-weight: bold; text-transform: uppercase; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
          .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
          .amount-box { text-align: center; font-size: 16px; font-weight: 900; margin: 10px 0; padding: 6px; border: 1px solid #000; }
          table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 11px; }
          th { text-align: left; border-bottom: 1px dashed #000; padding: 2px 0; }
          td { padding: 2px 0; }
          .text-right { text-align: right; }
          @media print { body { margin: 4mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">SRI LAKSHMI SILKS & TEXTILES</div>
          <div>Coimbatore - 641001 • Ph: +91 98421 55678</div>
          <div style="font-weight: bold; margin-top: 4px;">SALES ${receipt.return_type.toUpperCase()} VOUCHER</div>
        </div>

        <div class="row"><span>Voucher No:</span><strong>${receipt.return_number}</strong></div>
        <div class="row"><span>Date:</span><span>${receipt.return_date} ${receipt.return_time || ''}</span></div>
        <div class="row"><span>Original Bill:</span><strong>#${receipt.invoice_number}</strong></div>
        <div class="row"><span>Customer:</span><span>${receipt.customer_name || 'Walk-in Customer'}</span></div>
        <div class="row"><span>Reason:</span><span>${receipt.reason}</span></div>

        <div class="divider"></div>
        <div style="font-weight: bold; margin-bottom: 4px;">RETURNED ITEMS:</div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Refund (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${(receipt.items || []).map(i => `
              <tr>
                <td>${i.product_name}</td>
                <td class="text-right">${i.quantity_returned} ${i.unit}</td>
                <td class="text-right">₹${Number(i.item_refund_amount).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="divider"></div>
        <div class="row"><span>Total Return Value:</span><strong>₹${Number(receipt.total_return_amount).toFixed(2)}</strong></div>
        <div class="row"><span>GST Reversed:</span><span>₹${Number(receipt.total_tax_reversed).toFixed(2)}</span></div>

        ${receipt.return_type === 'exchange' ? `
          <div class="divider"></div>
          <div class="row"><span>Exchange Items Value:</span><strong>₹${Number(receipt.exchange_items_amount).toFixed(2)}</strong></div>
          <div class="amount-box">
            ${receipt.net_amount_payable > 0
              ? `CUSTOMER PAID: ₹${Number(receipt.net_amount_payable).toFixed(2)}`
              : receipt.net_amount_payable < 0
              ? `SHOP REFUNDED: ₹${Math.abs(Number(receipt.net_amount_payable)).toFixed(2)}`
              : 'EVEN EXCHANGE: ₹0.00'}
          </div>
        ` : `
          <div class="amount-box">
            REFUNDED VIA ${receipt.refund_method.toUpperCase()}: ₹${Number(receipt.total_return_amount).toFixed(2)}
          </div>
        `}

        <div class="divider"></div>
        <div style="text-align: center; font-size: 10px; margin-top: 10px;">
          Items verified & Restocked to Inventory.<br/>
          Authorized Signatory: ${receipt.handled_by_name || 'Cashier'}
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="space-y-5">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Sales Returns & Exchanges
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Lookup customer bills, process cloth returns, calculate refunds, handle exchanges, and auto-restock inventory.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab(activeTab === 'new' ? 'history' : 'new')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer"
          >
            {activeTab === 'new' ? (
              <>
                <Receipt className="w-4 h-4" />
                View Returns History
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                + New Return / Exchange
              </>
            )}
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
          feedbackMsg.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-800 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-950/40 border-red-300 text-red-800 dark:text-red-300'
        }`}>
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Total Returns Processed</span>
          <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">
            {summary?.total_returns || returnsList.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Customer returns & exchanges</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Total Refund Value</span>
          <div className="text-xl font-black text-rose-600 font-mono mt-1">
            ₹{Number(summary?.total_refund_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Returned product value</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Total Exchanges Value</span>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 font-mono mt-1">
            ₹{Number(summary?.total_exchange_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Replacement garments sold</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Net GST Reversed</span>
          <div className="text-xl font-black text-emerald-600 font-mono mt-1">
            ₹{Number(summary?.total_tax_reversed || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Adjusted in GST output</span>
        </div>
      </div>

      {/* VIEW: NEW RETURN WORKFLOW */}
      {activeTab === 'new' && (
        <div className="space-y-4">
          
          {/* STEP 1: INVOICE SEARCH */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
              Step 1: Lookup Original Sales Invoice
            </span>

            <form onSubmit={handleLookupInvoice} className="flex gap-2 max-w-lg">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={invoiceSearchQuery}
                  onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                  placeholder="Enter invoice number (e.g. SLT-1001)..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono uppercase font-bold focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={searchingInvoice}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs cursor-pointer"
              >
                {searchingInvoice ? 'Searching...' : 'Find Bill'}
              </button>
            </form>

            {originalInvoice && (
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    Bill #{originalInvoice.invoice_number}
                  </span>
                  <span className="text-slate-500 ml-2">({originalInvoice.invoice_date})</span>
                  <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                    Customer: <strong className="text-slate-900 dark:text-white">{originalInvoice.customer_name}</strong>
                    {originalInvoice.customer_phone && ` • +91 ${originalInvoice.customer_phone}`}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-slate-500">Bill Total:</span>
                  <div className="font-mono font-black text-slate-950 dark:text-white text-base">
                    ₹{Number(originalInvoice.grand_total).toFixed(2)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: SELECT ITEMS TO RETURN */}
          {originalInvoice && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                Step 2: Select Items to Return
              </span>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                      <th className="py-2.5 px-3 w-10 text-center">Return?</th>
                      <th className="py-2.5 px-3">Product Description</th>
                      <th className="py-2.5 px-3 text-center">Purchased</th>
                      <th className="py-2.5 px-3 text-center">Already Ret.</th>
                      <th className="py-2.5 px-3 text-center">Eligible</th>
                      <th className="py-2.5 px-3 w-24 text-center">Return Qty</th>
                      <th className="py-2.5 px-3 w-36">Condition</th>
                      <th className="py-2.5 px-3 text-right">Refund Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(originalInvoice.items || []).map((item: any) => {
                      const itemId = item.id || 0;
                      const sel = selectedReturnItems[itemId] || { selected: false, return_qty: 1, condition: 'undamaged' };
                      const alreadyReturned = item.returned_quantity || 0;
                      const eligibleQty = Math.max(0, item.quantity - alreadyReturned);

                      const unitRate = Number(item.rate) || 0;
                      const discountPerUnit = (Number(item.discount_amount) || 0) / (Number(item.quantity) || 1);
                      const netRate = Math.max(0, unitRate - discountPerUnit);
                      const gstRate = Number(item.gst_rate) || 0;
                      const lineRefund = Math.round(netRate * sel.return_qty * (item.is_tax_inclusive ? 1 : (1 + gstRate / 100)) * 100) / 100;

                      return (
                        <tr key={itemId} className={sel.selected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              disabled={eligibleQty <= 0}
                              checked={sel.selected}
                              onChange={(e) => {
                                setSelectedReturnItems(prev => ({
                                  ...prev,
                                  [itemId]: { ...sel, selected: e.target.checked }
                                }));
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {item.product_name}
                              {item.variant_name && <span className="ml-1 text-[11px] text-indigo-600 font-normal">({item.variant_name})</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">Rate: ₹{item.rate} • GST: {item.gst_rate}%</div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono">{item.quantity}</td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-500">{alreadyReturned}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600">{eligibleQty}</td>
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="number"
                              min="0.1"
                              max={eligibleQty}
                              step="any"
                              disabled={!sel.selected || eligibleQty <= 0}
                              value={sel.return_qty}
                              onChange={(e) => {
                                const val = Math.min(eligibleQty, Math.max(0.1, parseFloat(e.target.value) || 0.1));
                                setSelectedReturnItems(prev => ({
                                  ...prev,
                                  [itemId]: { ...sel, return_qty: val }
                                }));
                              }}
                              className="w-16 px-1.5 py-1 text-center rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              disabled={!sel.selected}
                              value={sel.condition}
                              onChange={(e) => {
                                setSelectedReturnItems(prev => ({
                                  ...prev,
                                  [itemId]: { ...sel, condition: e.target.value as any }
                                }));
                              }}
                              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                            >
                              <option value="undamaged">Undamaged (Restock)</option>
                              <option value="damaged">Damaged (No Restock)</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">
                            {sel.selected ? `₹${lineRefund.toFixed(2)}` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* STEP 3: RETURN VS EXCHANGE CHOICE */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-4 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-4">
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase">Choose Action:</span>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold">
                    <input
                      type="radio"
                      name="return_type"
                      checked={returnType === 'return'}
                      onChange={() => setReturnType('return')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Refund Only (Cash / UPI / Khata)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    <input
                      type="radio"
                      name="return_type"
                      checked={returnType === 'exchange'}
                      onChange={() => {
                        setReturnType('exchange');
                        if (exchangeItems.length === 0) handleAddExchangeItem();
                      }}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Product Exchange (Pick Replacement Items)</span>
                  </label>
                </div>

                {/* If Exchange: Select New Products */}
                {returnType === 'exchange' && (
                  <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase">
                        Replacement Items Selected ({exchangeItems.length})
                      </span>
                      <button
                        type="button"
                        onClick={handleAddExchangeItem}
                        className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Replacement Product
                      </button>
                    </div>

                    <div className="space-y-2">
                      {exchangeItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                          <select
                            value={item.product_id}
                            onChange={(e) => updateExchangeItem(idx, { product_id: Number(e.target.value) })}
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
                          >
                            {catalogProducts.map(p => (
                              <option key={p.id} value={p.id}>{p.name} - ₹{p.selling_price}</option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 text-[11px]">Qty:</span>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateExchangeItem(idx, { quantity: parseFloat(e.target.value) || 1 })}
                              className="w-14 px-1.5 py-1 text-center rounded border border-slate-300 dark:border-slate-700 font-mono font-bold"
                            />
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 text-[11px]">Rate:</span>
                            <input
                              type="number"
                              min="0"
                              value={item.selling_price}
                              onChange={(e) => updateExchangeItem(idx, { selling_price: parseFloat(e.target.value) || 0 })}
                              className="w-20 px-1.5 py-1 text-right rounded border border-slate-300 dark:border-slate-700 font-mono font-bold"
                            />
                          </div>

                          <div className="w-24 text-right font-mono font-bold text-slate-900 dark:text-white">
                            ₹{item.line_total.toFixed(2)}
                          </div>

                          <button
                            type="button"
                            onClick={() => removeExchangeItem(idx)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reason & Refund Method */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Return Reason</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="Wrong Size / Fit">Wrong Size / Fit</option>
                      <option value="Color / Design Change">Color / Design Change</option>
                      <option value="Defective / Damaged Fabric">Defective / Damaged Fabric</option>
                      <option value="Customer Change of Mind">Customer Change of Mind</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      {returnType === 'exchange' && netAmountPayable > 0 ? 'Customer Pays Difference Via' : 'Refund Method'}
                    </label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 uppercase font-medium"
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI / QR</option>
                      <option value="card">Card</option>
                      <option value="khata">Customer Khata Balance</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Notes</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional notes"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>

                {/* Financial Summary Calculation Banner */}
                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">Total Return Refund:</span>
                    <div className="font-mono font-bold text-rose-600 text-sm">₹{totalRefundAmount.toFixed(2)}</div>
                  </div>

                  {returnType === 'exchange' && (
                    <>
                      <div>
                        <span className="text-slate-500">Replacement Total:</span>
                        <div className="font-mono font-bold text-indigo-600 text-sm">₹{totalExchangeAmount.toFixed(2)}</div>
                      </div>
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-lg border border-indigo-200 dark:border-indigo-800 text-center">
                        <span className="text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-400 block">
                          Net Difference
                        </span>
                        <div className="font-mono font-black text-base text-indigo-700 dark:text-indigo-300">
                          {netAmountPayable > 0 ? `Customer Pays: ₹${netAmountPayable.toFixed(2)}` : netAmountPayable < 0 ? `Refund to Customer: ₹${Math.abs(netAmountPayable).toFixed(2)}` : 'Even Exchange (₹0.00)'}
                        </div>
                      </div>
                    </>
                  )}

                  <button
                    type="button"
                    disabled={submitting || itemsToReturnList.length === 0}
                    onClick={handleProcessReturn}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer ml-auto"
                  >
                    {submitting ? 'Processing Return...' : 'Confirm Return & Update Stock'}
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>
      )}

      {/* VIEW: RETURNS HISTORY */}
      {activeTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-3 px-3">Return No</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Original Bill</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3 text-center">Type</th>
                  <th className="py-3 px-3 text-right">Refund Value (₹)</th>
                  <th className="py-3 px-3 text-right">Exchange Value (₹)</th>
                  <th className="py-3 px-3 text-right">Net Settled (₹)</th>
                  <th className="py-3 px-3 text-center">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">Loading returns register...</td>
                  </tr>
                ) : returnsList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      No sales returns or exchanges recorded yet. Click "+ New Return / Exchange" to process one.
                    </td>
                  </tr>
                ) : (
                  returnsList.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {r.return_number}
                      </td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{r.return_date}</td>
                      <td className="py-3 px-3 font-mono font-bold text-indigo-600">#{r.invoice_number}</td>
                      <td className="py-3 px-3 font-medium text-slate-900 dark:text-white">{r.customer_name || 'Walk-in'}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          r.return_type === 'exchange'
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                        }`}>
                          {r.return_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-rose-600 font-bold">
                        ₹{Number(r.total_return_amount).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-indigo-600 font-bold">
                        {r.exchange_items_amount > 0 ? `₹${Number(r.exchange_items_amount).toFixed(2)}` : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-900 dark:text-white">
                        ₹{Number(r.net_amount_payable).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => setActiveReceipt(r)}
                          className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold flex items-center justify-center gap-1 mx-auto cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Receipt
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RETURN RECEIPT MODAL */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-indigo-600">
                <Receipt className="w-5 h-5" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Return Voucher #{activeReceipt.return_number}
                </h3>
              </div>
              <button onClick={() => setActiveReceipt(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Original Invoice:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">#{activeReceipt.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span>{activeReceipt.return_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-bold">{activeReceipt.customer_name || 'Walk-in Customer'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Return Reason:</span>
                <span>{activeReceipt.reason}</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-1">
                <span>Refund Value:</span>
                <span className="font-mono text-rose-600">₹{Number(activeReceipt.total_return_amount).toFixed(2)}</span>
              </div>
              {activeReceipt.return_type === 'exchange' && (
                <div className="flex justify-between font-black text-sm text-indigo-600">
                  <span>Net Difference:</span>
                  <span className="font-mono">₹{Number(activeReceipt.net_amount_payable).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handlePrintReturnReceipt(activeReceipt)}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Voucher
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
