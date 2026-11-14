import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  PieChart as PieIcon,
  Calendar,
  AlertCircle,
  Receipt,
  DollarSign
} from 'lucide-react';
import api from '../services/api';
import { Expense } from '../types';

const EXPENSE_CATEGORIES = [
  'Electricity',
  'Rent',
  'Employee Salaries',
  'Transportation',
  'Maintenance',
  'Tea & Refreshments',
  'Packaging',
  'Marketing',
  'Other'
];

export const ExpensesPage: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([]);
  const [totalExpense, setTotalExpense] = useState(0);
  const [pnl, setPnl] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  // Add Expense Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    category: 'Electricity',
    title: '',
    amount: 0,
    expense_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    receipt_number: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (selectedMonth) params.append('month', selectedMonth);

      const [expRes, pnlRes] = await Promise.all([
        api.get(`/expenses?${params.toString()}`),
        api.get(`/expenses/pnl?${params.toString()}`)
      ]);

      setExpenses(expRes.data.expenses);
      setCategoryBreakdown(expRes.data.category_breakdown);
      setTotalExpense(expRes.data.total_amount);
      setPnl(pnlRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCategory, selectedMonth]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || formData.amount <= 0) return;
    setSubmitting(true);
    try {
      await api.post('/expenses', formData);
      setShowAddModal(false);
      setFormData({
        category: 'Electricity',
        title: '',
        amount: 0,
        expense_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash',
        receipt_number: '',
        notes: ''
      });
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!window.confirm('Delete this expense record?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Operating Expenses & Net Profit (P&L)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Track showroom overheads, utility bills, employee compensation, and calculate realistic net operating profit.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Record Expense
        </button>
      </div>

      {/* NET PROFIT & LOSS HIGH-LEVEL CARDS (SECTION 12) */}
      {pnl && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Net Sales (Excl GST) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Net Revenue (Excl Tax)
            </span>
            <div className="text-xl font-black font-mono text-slate-950 dark:text-white">
              ₹{Number(pnl.net_sales_excl_tax).toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-slate-500">Gross: ₹{Number(pnl.gross_revenue).toLocaleString('en-IN')} (GST: ₹{Number(pnl.gst_collected).toFixed(1)})</span>
          </div>

          {/* Cost of Goods Sold (COGS) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Cost of Goods Sold (COGS)
            </span>
            <div className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">
              ₹{Number(pnl.cogs).toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-slate-500">Gross Margin: ₹{Number(pnl.gross_profit).toLocaleString('en-IN')}</span>
          </div>

          {/* Operating Overheads */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Operating Overheads
            </span>
            <div className="text-xl font-black font-mono text-rose-600 dark:text-rose-400">
              ₹{Number(pnl.operating_expenses).toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] text-slate-500">Rent, Power, Salaries & Misc</span>
          </div>

          {/* Estimated Net Operating Profit */}
          <div className={`border rounded-2xl p-4 shadow-xs ${
            pnl.net_operating_profit >= 0
              ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
              : 'bg-red-50/50 dark:bg-red-950/30 border-red-300 dark:border-red-800'
          }`}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Estimated Net Operating Profit
            </span>
            <div className={`text-2xl font-black font-mono ${
              pnl.net_operating_profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'
            }`}>
              ₹{Number(pnl.net_operating_profit).toLocaleString('en-IN')}
            </div>
            <span className="text-[10px] font-bold">
              Net Profit Margin: {pnl.profit_margin_percent}%
            </span>
          </div>

        </div>
      )}

      {/* FILTER & BREAKDOWN ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Category Breakdown Sidebar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm uppercase tracking-wider">
            Expenses by Category
          </h3>

          <div className="space-y-2 text-xs">
            {categoryBreakdown.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{c.category}</span>
                  <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({c.count} bills)</span>
                </div>
                <span className="font-mono font-bold text-slate-950 dark:text-white">
                  ₹{Number(c.total).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* EXPENSES LOG TABLE */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm uppercase tracking-wider">
              Expense Transactions ({expenses.length})
            </h3>

            <div className="flex items-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              >
                <option value="">All Expense Heads</option>
                {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>

              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">Loading expenses...</td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">No expenses recorded for this filter.</td>
                  </tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{e.expense_date}</td>
                      <td className="py-2.5 px-3">
                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          {e.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {e.title}
                        {e.notes && <span className="text-[10px] text-slate-400 block font-normal">{e.notes}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        ₹{Number(e.amount).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 uppercase text-[10px] text-slate-500 font-semibold">{e.payment_method}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleDeleteExpense(e.id)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

      {/* ADD EXPENSE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Record Business Expense
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Expense Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                >
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Title / Particulars <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Showroom Electricity Bill, Staff Salaries"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Amount Paid (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Date Paid
                  </label>
                  <input
                    type="date"
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white uppercase font-medium"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Voucher / Receipt #
                  </label>
                  <input
                    type="text"
                    value={formData.receipt_number}
                    onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                    placeholder="Optional reference"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Additional Notes
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Details about vendor, purpose..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md"
                >
                  {submitting ? 'Recording...' : 'Save Expense'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

