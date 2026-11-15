import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Download,
  Calendar,
  Layers,
  ShoppingBag,
  Users,
  Clock,
  RefreshCw,
  Percent,
  Wallet,
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  Building,
  FileSpreadsheet
} from 'lucide-react';
import api from '../services/api';

export const SalesAnalyticsPage: React.FC = () => {
  const [period, setPeriod] = useState<string>('month'); // today, yesterday, week, month, year, custom
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('period', period);
      if (period === 'custom') {
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
      }
      const res = await api.get(`/reports/advanced-analytics?${params.toString()}`);
      setAnalytics(res.data);
    } catch (err) {
      console.error('Failed to load advanced analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (period === 'custom') {
      fetchAnalytics();
    }
  };

  const handleExport = (format: 'xlsx' | 'csv') => {
    window.open(`/api/reports/export?type=daily&format=${format}`, '_blank');
  };

  const kpi = analytics?.kpi || {
    gross_sales: 0,
    net_sales: 0,
    total_discount: 0,
    total_tax: 0,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total_cogs: 0,
    gross_profit: 0,
    gross_margin_percent: 0,
    total_expenses: 0,
    net_profit: 0,
    net_margin_percent: 0,
    active_khata_dues: 0,
    invoices_count: 0
  };

  const bestSellers = analytics?.best_sellers || [];
  const slowMovers = analytics?.slow_movers || [];
  const categories = analytics?.categories || [];
  const paymentMethods = analytics?.payment_methods || [];
  const dailyTrends = analytics?.daily_trends || [];

  return (
    <div className="space-y-6">
      
      {/* Top Header & Export */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Advanced Retail Sales & Profit Analytics
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Real-time retail metrics, gross/net margins, GST liability, product turnover, slow-moving inventory, and sales channels.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => handleExport('xlsx')}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Excel
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold shadow-xs hover:bg-slate-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* TIMELINE PRESET SELECTOR & CUSTOM DATE RANGE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'year', label: 'This Financial Year' },
            { id: 'custom', label: 'Custom Range' }
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => setPeriod(preset.id)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                period === preset.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom Date Pickers */}
        {period === 'custom' && (
          <form onSubmit={handleApplyCustomDates} className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl font-bold cursor-pointer"
            >
              Apply
            </button>
          </form>
        )}

        <button
          onClick={fetchAnalytics}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg ml-auto cursor-pointer"
          title="Refresh analytics metrics"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

      </div>

      {/* 8 EXECUTIVE FINANCIAL KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Gross Sales */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Gross Sales Value</span>
          <div className="text-2xl font-black text-slate-950 dark:text-white font-mono mt-1">
            ₹{Number(kpi.gross_sales).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>{kpi.invoices_count} bills billed</span>
            <span className="text-emerald-600 font-semibold">Net: ₹{Number(kpi.net_sales).toFixed(2)}</span>
          </div>
        </div>

        {/* Total Discounts */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Discounts Given</span>
          <div className="text-2xl font-black text-amber-600 font-mono mt-1">
            ₹{Number(kpi.total_discount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Product & invoice discounts</span>
        </div>

        {/* GST Output Liability */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">GST Output Tax</span>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono mt-1">
            ₹{Number(kpi.total_tax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            CGST: ₹{kpi.cgst.toFixed(0)} • SGST: ₹{kpi.sgst.toFixed(0)} • IGST: ₹{kpi.igst.toFixed(0)}
          </div>
        </div>

        {/* Cost of Goods Sold (COGS) */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Cost of Goods Sold (COGS)</span>
          <div className="text-2xl font-black text-slate-700 dark:text-slate-300 font-mono mt-1">
            ₹{Number(kpi.total_cogs).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Purchase cost of items sold</span>
        </div>

        {/* Gross Profit & Margin */}
        <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 border-2 border-emerald-500/50 dark:border-emerald-500/40 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-800 dark:text-emerald-300 font-bold uppercase">Gross Profit</span>
            <span className="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-black">
              {kpi.gross_margin_percent}% Margin
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono mt-1">
            ₹{Number(kpi.gross_profit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-1 block">
            Net Sales - Product Purchase Cost
          </span>
        </div>

        {/* Store Expenses */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Store Operating Expenses</span>
          <div className="text-2xl font-black text-rose-600 font-mono mt-1">
            ₹{Number(kpi.total_expenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Rent, salaries, electricity, etc.</span>
        </div>

        {/* Net Profit & Margin */}
        <div className={`p-4 rounded-2xl border-2 shadow-xs ${
          kpi.net_profit >= 0
            ? 'bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-500/50 dark:border-indigo-500/40'
            : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-500/50 dark:border-rose-500/40'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-indigo-900 dark:text-indigo-300">Net Estimated Profit</span>
            <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded-full text-[10px] font-black">
              {kpi.net_margin_percent}% Net
            </span>
          </div>
          <div className={`text-2xl font-black font-mono mt-1 ${kpi.net_profit >= 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-rose-600'}`}>
            ₹{Number(kpi.net_profit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-indigo-700/80 dark:text-indigo-400/80 mt-1 block">
            Gross Profit - Operating Expenses
          </span>
        </div>

        {/* Khata Dues */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Active Khata Receivables</span>
          <div className="text-2xl font-black text-amber-600 font-mono mt-1">
            ₹{Number(kpi.active_khata_dues).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Customer credit pending collection</span>
        </div>

      </div>

      {/* TWO COLUMN GRID: Best Sellers vs Slow Movers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Top 10 Best Selling Products (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-indigo-600" />
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm uppercase tracking-wider">
                Top 10 Best-Selling Products
              </h3>
            </div>
            <span className="text-xs text-slate-400">By volume & revenue</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                  <th className="py-2.5 px-2 w-8 text-center">#</th>
                  <th className="py-2.5 px-2">Cloth / Product</th>
                  <th className="py-2.5 px-2 text-right">Units Sold</th>
                  <th className="py-2.5 px-2 text-right">Revenue (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {bestSellers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">No sales recorded in this period.</td>
                  </tr>
                ) : (
                  bestSellers.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-2 text-center font-bold text-slate-400">
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="font-bold text-slate-900 dark:text-white">{item.product_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {item.units_sold}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-950 dark:text-white">
                        ₹{Number(item.revenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Slow-Moving / Dead Stock (5 Cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm uppercase tracking-wider">
                Slow-Moving Stock Alert
              </h3>
            </div>
            <span className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded font-bold">
              Action Required
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Products with low or zero sales during this timeframe with stock sitting in inventory:
          </p>

          <div className="space-y-2 max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {slowMovers.length === 0 ? (
              <div className="py-8 text-center text-slate-400">No stagnant products identified.</div>
            ) : (
              slowMovers.map((item: any, idx: number) => (
                <div key={idx} className="pt-2 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{item.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Stock: <strong className="text-slate-700 dark:text-slate-300">{item.stock_quantity} {item.unit}</strong> • Selling: ₹{item.selling_price}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                      {item.units_sold || 0} sold
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* TWO COLUMN GRID: Sales by Category & Payment Methods Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Sales by Category (6 Cols) */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm uppercase tracking-wider">
              Sales by Textile Category
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            {categories.length === 0 ? (
              <div className="py-6 text-center text-slate-400">No category breakdown data available.</div>
            ) : (
              categories.map((c: any, idx: number) => {
                const totalRev = Number(kpi.gross_sales) || 1;
                const percent = Math.min(100, Math.round(((Number(c.revenue) || 0) / totalRev) * 100));

                return (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-slate-900 dark:text-white">{c.category_name}</span>
                      <span className="font-mono text-slate-950 dark:text-white">
                        ₹{Number(c.revenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({percent}%)
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${percent}%` }}></div>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Units sold: {c.units_sold}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Payment Methods Breakdown (6 Cols) */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm uppercase tracking-wider">
              Sales by Payment Method
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            {paymentMethods.length === 0 ? (
              <div className="py-6 text-center text-slate-400">No payment data recorded in this period.</div>
            ) : (
              paymentMethods.map((pm: any, idx: number) => {
                const total = paymentMethods.reduce((s: number, i: any) => s + (Number(i.total_amount) || 0), 0) || 1;
                const pct = Math.min(100, Math.round(((Number(pm.total_amount) || 0) / total) * 100));

                return (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900 dark:text-white uppercase">
                        {pm.payment_method === 'upi' ? '⚡ UPI / QR Scan & Pay' : pm.payment_method}
                      </span>
                      <span className="font-mono font-bold text-slate-950 dark:text-white">
                        ₹{Number(pm.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {pm.bills_count} transactions
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
