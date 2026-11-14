import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Search,
  Filter,
  Calendar,
  Wallet,
  Smartphone,
  Landmark,
  Banknote,
  RefreshCw
} from 'lucide-react';
import api from '../services/api';

export const PaymentsPage: React.FC = () => {
  const [payments, setPayments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedMethod, setSelectedMethod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedMethod) params.append('method', selectedMethod);
      if (startDate && endDate) {
        params.append('start_date', startDate);
        params.append('end_date', endDate);
      }
      if (searchQuery.trim()) params.append('q', searchQuery.trim());

      const res = await api.get(`/payments?${params.toString()}`);
      setPayments(res.data.payments);
      setSummary(res.data.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [selectedMethod]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPayments();
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, startDate, endDate]);

  const getMethodIcon = (method: string) => {
    switch (method?.toLowerCase()) {
      case 'upi': return <Smartphone className="w-4 h-4 text-emerald-600" />;
      case 'card': return <CreditCard className="w-4 h-4 text-blue-600" />;
      case 'bank_transfer': return <Landmark className="w-4 h-4 text-purple-600" />;
      default: return <Banknote className="w-4 h-4 text-amber-600" />;
    }
  };

  const totalCollected = summary.reduce((acc, curr) => acc + curr.total, 0);

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Payments & Collections Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Real-time tracking of UPI, Cash, Card, and Bank Transfer receipts across counter billing and credit recoveries.
          </p>
        </div>

        <button
          onClick={fetchPayments}
          className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold shadow-xs self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* SUMMARY METHOD CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        
        {/* Total Overall */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Total Collections</span>
          <div className="text-xl font-black font-mono text-slate-950 dark:text-white">
            ₹{totalCollected.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-slate-500">{payments.length} transactions</span>
        </div>

        {/* Method cards */}
        {['cash', 'upi', 'card', 'bank_transfer'].map(m => {
          const item = summary.find(s => s.payment_method?.toLowerCase() === m) || { total: 0, count: 0 };
          return (
            <div key={m} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{m.replace('_', ' ')}</span>
                {getMethodIcon(m)}
              </div>
              <div className="text-xl font-black font-mono text-slate-900 dark:text-white">
                ₹{Number(item.total).toLocaleString('en-IN')}
              </div>
              <span className="text-[11px] text-slate-500">{item.count} receipts</span>
            </div>
          );
        })}

      </div>

      {/* FILTERS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search invoice#, customer, reference..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
          >
            <option value="">All Payment Modes</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI / QR Code</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
        </div>

      </div>

      {/* PAYMENTS TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Method</th>
                <th className="py-3 px-3 text-right">Amount (₹)</th>
                <th className="py-3 px-3">Invoice Number</th>
                <th className="py-3 px-3">Customer Linked</th>
                <th className="py-3 px-3">Reference / Txn ID</th>
                <th className="py-3 px-3">Cashier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">Loading payment receipts...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">No payment records found.</td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{p.payment_date}</td>
                    <td className="py-3 px-3 font-semibold uppercase flex items-center gap-2">
                      {getMethodIcon(p.payment_method)}
                      <span>{p.payment_method}</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-slate-950 dark:text-white text-sm">
                      ₹{Number(p.amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {p.invoice_number || 'Direct Credit'}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                      {p.customer_name_linked || '-'}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">
                      {p.reference_number || p.notes || '-'}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                      {p.received_by_name || 'Staff'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

