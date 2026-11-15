import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Calendar,
  Eye,
  Printer,
  Download,
  XCircle,
  RotateCcw,
  CreditCard,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  MessageCircle
} from 'lucide-react';
import api from '../services/api';
import { Invoice } from '../types';

interface BillingHistoryPageProps {
  onViewInvoice: (inv: Invoice, autoPrint?: boolean) => void;
}

export const BillingHistoryPage: React.FC<BillingHistoryPageProps> = ({ onViewInvoice }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [period, setPeriod] = useState<string>('all'); // all, today, weekly, monthly, yearly, custom
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [cancelModalInvoice, setCancelModalInvoice] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [restoreStockOnCancel, setRestoreStockOnCancel] = useState(true);

  const [refundModalInvoice, setRefundModalInvoice] = useState<Invoice | null>(null);
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundPaymentMethod, setRefundPaymentMethod] = useState('cash');
  const [restockOnRefund, setRestockOnRefund] = useState(true);
  const [refundReason, setRefundReason] = useState('');

  const [settleModalInvoice, setSettleModalInvoice] = useState<Invoice | null>(null);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleMethod, setSettleMethod] = useState('cash');
  const [settleRef, setSettleRef] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (period !== 'all' && period !== 'custom') params.append('period', period);
      if (period === 'custom') {
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
      }
      if (statusFilter) params.append('status', statusFilter);
      if (paymentFilter) params.append('payment_status', paymentFilter);
      if (searchQuery.trim()) params.append('q', searchQuery.trim());

      const res = await api.get(`/invoices?${params.toString()}`);
      setInvoices(res.data.invoices);
      setSummary(res.data.summary);
    } catch (err) {
      console.error('Failed to fetch invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [period, statusFilter, paymentFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInvoices();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, startDate, endDate]);

  // Handle Cancel Invoice
  const handleCancelInvoice = async () => {
    if (!cancelModalInvoice || !cancelReason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/invoices/${cancelModalInvoice.id}/cancel`, {
        reason: cancelReason,
        restore_stock: restoreStockOnCancel
      });
      setFeedbackMsg({ type: 'success', text: `Invoice ${cancelModalInvoice.invoice_number} cancelled successfully.` });
      setCancelModalInvoice(null);
      setCancelReason('');
      fetchInvoices();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.response?.data?.error || 'Failed to cancel invoice.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Refund Process
  const handleProcessRefund = async () => {
    if (!refundModalInvoice || !refundReason.trim()) return;
    setActionLoading(true);
    try {
      const amt = refundType === 'full' ? refundModalInvoice.grand_total : refundAmount;
      await api.post(`/invoices/${refundModalInvoice.id}/refund`, {
        refund_type: refundType,
        refund_amount: amt,
        refund_payment_method: refundPaymentMethod,
        restock_inventory: restockOnRefund,
        reason: refundReason
      });
      setFeedbackMsg({ type: 'success', text: `Refund processed for invoice ${refundModalInvoice.invoice_number}.` });
      setRefundModalInvoice(null);
      setRefundReason('');
      fetchInvoices();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.response?.data?.error || 'Failed to process refund.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Settle Balance Due
  const handleSettlePayment = async () => {
    if (!settleModalInvoice || settleAmount <= 0) return;
    setActionLoading(true);
    try {
      await api.post(`/invoices/${settleModalInvoice.id}/payment`, {
        amount: settleAmount,
        payment_method: settleMethod,
        reference_number: settleRef
      });
      setFeedbackMsg({ type: 'success', text: `Payment of ₹${settleAmount} recorded successfully.` });
      setSettleModalInvoice(null);
      fetchInvoices();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.response?.data?.error || 'Failed to record payment.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Billing History & Thermal Receipts
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Search, filter, reprint thermal receipts (58mm/80mm), settle dues, cancel, or process refunds.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {invoices.length > 0 && (
            <button
              onClick={() => onViewInvoice(invoices[0], true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95"
              title="Quickly reprint the most recently created bill on your thermal printer"
            >
              <Printer className="w-3.5 h-3.5" />
              Reprint Latest Bill (#{invoices[0].invoice_number})
            </button>
          )}

          <button
            onClick={fetchInvoices}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
          feedbackMsg.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300'
            : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-300'
        }`}>
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* FILTER CONTROLS BAR */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        
        {/* Top Filter Row: Period Tabs + Search */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          {/* Period Tabs */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-semibold">
            {[
              { id: 'all', label: 'All Invoices' },
              { id: 'today', label: 'Today' },
              { id: 'weekly', label: 'This Week' },
              { id: 'monthly', label: 'This Month' },
              { id: 'yearly', label: 'This Year' },
              { id: 'custom', label: 'Custom Range' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPeriod(tab.id)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  period === tab.id
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Invoice#, Customer, Mobile..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

        </div>

        {/* Second Filter Row: Custom Date Inputs & Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
              <span className="text-slate-500">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-slate-500">Invoice Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">Payment:</span>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="">All Payments</option>
              <option value="paid">Fully Paid</option>
              <option value="partial">Partially Paid</option>
              <option value="unpaid">Unpaid / Dues</option>
            </select>
          </div>

          {/* Aggregated Quick Metrics in Toolbar */}
          {summary && (
            <div className="ml-auto text-slate-500 flex items-center gap-3 font-medium">
              <span>Matching: <b>{summary.total_count}</b> bills</span>
              <span>Total: <b className="font-mono text-slate-900 dark:text-white">₹{Number(summary.total_amount).toLocaleString('en-IN')}</b></span>
              <span>Due: <b className="font-mono text-amber-600">₹{Number(summary.total_due).toLocaleString('en-IN')}</b></span>
            </div>
          )}

        </div>

      </div>

      {/* INVOICES TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                <th className="py-3 px-3">Invoice No</th>
                <th className="py-3 px-3">Date & Time</th>
                <th className="py-3 px-3">Customer Name</th>
                <th className="py-3 px-3">Mobile</th>
                <th className="py-3 px-3 text-right">Taxable (₹)</th>
                <th className="py-3 px-3 text-right">GST (₹)</th>
                <th className="py-3 px-3 text-right">Grand Total (₹)</th>
                <th className="py-3 px-3 text-right">Paid (₹)</th>
                <th className="py-3 px-3 text-right">Due (₹)</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <span className="text-slate-400">Loading invoices...</span>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    No invoices matching the selected filters.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    
                    {/* Invoice Number */}
                    <td className="py-3 px-3 font-mono font-bold text-slate-950 dark:text-white">
                      {inv.invoice_number}
                    </td>

                    {/* Date & Time */}
                    <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                      {inv.invoice_date} <span className="text-[10px] text-slate-400">{inv.invoice_time}</span>
                    </td>

                    {/* Customer */}
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-200">
                      {inv.customer_name}
                    </td>

                    {/* Mobile */}
                    <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                      {inv.customer_phone || '-'}
                    </td>

                    {/* Taxable Amount */}
                    <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                      ₹{Number(inv.total_taxable_amount).toFixed(2)}
                    </td>

                    {/* Total GST */}
                    <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                      ₹{Number(inv.total_tax_amount).toFixed(2)}
                    </td>

                    {/* Grand Total */}
                    <td className="py-3 px-3 text-right font-mono font-black text-slate-950 dark:text-white">
                      ₹{Number(inv.grand_total).toLocaleString('en-IN')}
                    </td>

                    {/* Paid */}
                    <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                      ₹{Number(inv.amount_paid).toFixed(2)}
                    </td>

                    {/* Balance Due */}
                    <td className="py-3 px-3 text-right font-mono">
                      {inv.balance_due > 0 ? (
                        <span className="font-bold text-red-600">₹{Number(inv.balance_due).toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-400">₹0.00</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        inv.status === 'cancelled'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                          : inv.status === 'refunded'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400'
                          : inv.payment_status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                      }`}>
                        {inv.status === 'active' ? inv.payment_status : inv.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        
                        {/* Preview Thermal Receipt */}
                        <button
                          onClick={() => onViewInvoice(inv, false)}
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Preview Thermal Receipt (58mm/80mm, PDF, Dynamic QR)"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Reprint Thermal Receipt Direct */}
                        <button
                          onClick={() => onViewInvoice(inv, true)}
                          className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors font-bold"
                          title="Reprint Thermal Receipt (Auto-print to POS Roll Printer)"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {/* WhatsApp Share */}
                        <button
                          onClick={async () => {
                            let phone = inv.customer_phone || '';
                            if (!phone) {
                              const input = prompt('Enter customer 10-digit mobile number for WhatsApp sharing:');
                              if (!input) return;
                              phone = input.trim();
                            }
                            try {
                              const res = await api.get(`/invoices/${inv.id}/whatsapp?phone=${encodeURIComponent(phone)}`);
                              if (res.data?.whatsappUrl) {
                                window.open(res.data.whatsappUrl, '_blank');
                              }
                            } catch (e) {
                              alert('Could not generate WhatsApp share link.');
                            }
                          }}
                          className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors"
                          title="Share Invoice on WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>

                        {/* Collect Payment (if balance due) */}
                        {inv.status === 'active' && inv.balance_due > 0 && (
                          <button
                            onClick={() => {
                              setSettleModalInvoice(inv);
                              setSettleAmount(inv.balance_due);
                            }}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors"
                            title="Collect Pending Dues"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                        )}

                        {/* Process Refund / Return */}
                        {inv.status === 'active' && (
                          <button
                            onClick={() => {
                              setRefundModalInvoice(inv);
                              setRefundAmount(inv.grand_total);
                            }}
                            className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg transition-colors"
                            title="Process Refund / Return"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}

                        {/* Cancel Invoice */}
                        {inv.status === 'active' && (
                          <button
                            onClick={() => setCancelModalInvoice(inv)}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                            title="Cancel Invoice"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}

                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CANCEL INVOICE MODAL */}
      {cancelModalInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-100 dark:bg-red-950/60 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Cancel Invoice {cancelModalInvoice.invoice_number}
                </h3>
                <p className="text-xs text-slate-500">
                  Value: ₹{cancelModalInvoice.grand_total} • Date: {cancelModalInvoice.invoice_date}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              This action will mark the bill as cancelled and adjust GST and customer ledgers.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Cancellation <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer changed mind, accidental duplicate entry..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreStockOnCancel}
                  onChange={(e) => setRestoreStockOnCancel(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Automatically restore sold quantities back to store inventory</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCancelModalInvoice(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={actionLoading || !cancelReason.trim()}
                onClick={handleCancelInvoice}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md"
              >
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROCESS REFUND MODAL */}
      {refundModalInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-purple-600">
              <div className="p-2.5 bg-purple-100 dark:bg-purple-950/60 rounded-xl">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Process Return / Refund
                </h3>
                <p className="text-xs text-slate-500">
                  Invoice {refundModalInvoice.invoice_number} • Total: ₹{refundModalInvoice.grand_total}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Refund Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRefundType('full');
                      setRefundAmount(refundModalInvoice.grand_total);
                    }}
                    className={`p-2 rounded-lg font-bold border ${
                      refundType === 'full'
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Full Refund (₹{refundModalInvoice.grand_total})
                  </button>

                  <button
                    type="button"
                    onClick={() => setRefundType('partial')}
                    className={`p-2 rounded-lg font-bold border ${
                      refundType === 'partial'
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Partial Refund
                  </button>
                </div>
              </div>

              {refundType === 'partial' && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Refund Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={refundModalInvoice.grand_total}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Payout Method
                </label>
                <select
                  value={refundPaymentMethod}
                  onChange={(e) => setRefundPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white uppercase font-medium"
                >
                  <option value="cash">Cash Return</option>
                  <option value="upi">UPI Transfer</option>
                  <option value="bank_transfer">Bank Credit</option>
                  <option value="credit_note">Store Credit Note</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Reason for Return <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Size mismatch, fabric defect, exchange..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <label className="flex items-center gap-2 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={restockOnRefund}
                  onChange={(e) => setRestockOnRefund(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500"
                />
                <span>Restock returned cloth pieces back into store inventory</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setRefundModalInvoice(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !refundReason.trim()}
                onClick={handleProcessRefund}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md"
              >
                {actionLoading ? 'Processing...' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTLE DUE PAYMENT MODAL */}
      {settleModalInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Collect Customer Dues
                </h3>
                <p className="text-xs text-slate-500">
                  Invoice {settleModalInvoice.invoice_number} • Outstanding: ₹{settleModalInvoice.balance_due}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Payment Collection Amount (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  max={settleModalInvoice.balance_due}
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-base"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Received Via
                </label>
                <select
                  value={settleMethod}
                  onChange={(e) => setSettleMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white uppercase font-medium"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / QR</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Reference Note (optional)
                </label>
                <input
                  type="text"
                  value={settleRef}
                  onChange={(e) => setSettleRef(e.target.value)}
                  placeholder="e.g. UPI txn id or receipt ref"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSettleModalInvoice(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || settleAmount <= 0}
                onClick={handleSettlePayment}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md"
              >
                {actionLoading ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

