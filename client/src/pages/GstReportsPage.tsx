import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Filter,
  TrendingUp,
  Percent,
  CheckCircle2,
  RefreshCw,
  Table,
  BarChart3
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import api from '../services/api';

export const GstReportsPage: React.FC = () => {
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [financialYear, setFinancialYear] = useState('2026-2027');
  const [period, setPeriod] = useState<string>('all'); // all, monthly, custom
  const [selectedMonth, setSelectedMonth] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchGstReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (financialYear) params.append('financial_year', financialYear);
      if (selectedMonth) params.append('month', selectedMonth);
      if (startDate && endDate) {
        params.append('start_date', startDate);
        params.append('end_date', endDate);
      }

      const res = await api.get(`/gst/reports?${params.toString()}`);
      setReportData(res.data);
    } catch (err) {
      console.error('Failed to load GST reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGstReport();
  }, [financialYear, selectedMonth]);

  // Export handlers
  const handleExport = (format: 'xlsx' | 'csv') => {
    const params = new URLSearchParams();
    if (financialYear) params.append('financial_year', financialYear);
    if (startDate && endDate) {
      params.append('start_date', startDate);
      params.append('end_date', endDate);
    }
    params.append('format', format);

    window.open(`/api/gst/export?${params.toString()}`, '_blank');
  };

  const summary = reportData?.summary || {};
  const rateBreakdown = reportData?.rate_breakdown || [];
  const hsnBreakdown = reportData?.hsn_breakdown || [];
  const timeSeries = reportData?.time_series || [];

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            GST Management & Tax Analytics
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Compliant Indian GST reports, GSTR-1 preparation, HSN-wise summary, and intra/inter-state tax register.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => handleExport('xlsx')}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
            title="Download multi-sheet GST Sales Register in Excel"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel (.xlsx)
          </button>

          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold shadow-xs"
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* FILTER BAR: Financial Year & Dates */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs">
        
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Financial Year Selector */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Financial Year:</span>
            <select
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
            >
              <option value="2026-2027">FY 2026 - 2027</option>
              <option value="2025-2026">FY 2025 - 2026</option>
              <option value="2024-2025">FY 2024 - 2025</option>
            </select>
          </div>

          {/* Month Selector */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Filter Month:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            {selectedMonth && (
              <button
                onClick={() => setSelectedMonth('')}
                className="text-xs text-indigo-600 hover:underline"
              >
                Clear
              </button>
            )}
          </div>

        </div>

        <button
          onClick={fetchGstReport}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Recalculate
        </button>

      </div>

      {/* SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        
        {/* Total Taxable Sales */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Taxable Sales</span>
          <div className="text-lg font-black font-mono text-slate-950 dark:text-white">
            ₹{Number(summary.net_taxable || 0).toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-slate-500">{summary.invoice_count || 0} Bills</span>
        </div>

        {/* CGST */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Central Tax (CGST)</span>
          <div className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">
            ₹{Number(summary.net_cgst || 0).toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500">50% Intra-State</span>
        </div>

        {/* SGST */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">State Tax (SGST)</span>
          <div className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">
            ₹{Number(summary.net_sgst || 0).toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500">50% Intra-State</span>
        </div>

        {/* IGST */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Integrated (IGST)</span>
          <div className="text-lg font-black font-mono text-amber-600 dark:text-amber-400">
            ₹{Number(summary.net_igst || 0).toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500">Inter-State</span>
        </div>

        {/* Net GST Collected */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">Net GST Total</span>
          <div className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
            ₹{Number(summary.net_gst || 0).toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500">Total Tax Ledger</span>
        </div>

        {/* Total Discounts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Discounts Allowed</span>
          <div className="text-lg font-black font-mono text-rose-600 dark:text-rose-400">
            ₹{Number(summary.total_discounts || 0).toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-500">Pre-Tax Deduction</span>
        </div>

        {/* Gross Invoiced Sales */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Gross Sales</span>
          <div className="text-lg font-black font-mono text-slate-950 dark:text-white">
            ₹{Number(summary.net_sales || 0).toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-slate-500">Excl. Returns</span>
        </div>

      </div>

      {/* CHART: GST TAX COLLECTIONS OVER TIME */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
          GST Collection Trend (CGST vs SGST vs IGST)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Time-series of central, state, and integrated tax components
        </p>

        <div className="h-64">
          {timeSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date_label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `₹${val}`} />
                <Tooltip formatter={(val: any) => `₹${Number(val).toFixed(2)}`} />
                <Legend />
                <Bar dataKey="cgst" name="CGST (₹)" stackId="gst" fill="#6366f1" />
                <Bar dataKey="sgst" name="SGST (₹)" stackId="gst" fill="#a855f7" />
                <Bar dataKey="igst" name="IGST (₹)" stackId="gst" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              No transactions in selected tax window
            </div>
          )}
        </div>
      </div>

      {/* TWO TABLES: RATE-WISE SLABS & HSN-WISE SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* RATE-WISE GST BREAKDOWN (0%, 5%, 12%, 18%, 28%) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            Rate-Wise GST Slabs Breakdown
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Aggregated by Indian GST tax rates
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-2.5 px-3">Tax Slab</th>
                  <th className="py-2.5 px-3 text-right">Taxable Sales (₹)</th>
                  <th className="py-2.5 px-3 text-right">CGST (₹)</th>
                  <th className="py-2.5 px-3 text-right">SGST (₹)</th>
                  <th className="py-2.5 px-3 text-right">IGST (₹)</th>
                  <th className="py-2.5 px-3 text-right">Total GST (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rateBreakdown.map((r: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                      <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded font-mono">
                        {r.gst_rate}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900 dark:text-white">
                      ₹{Number(r.taxable_amount).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      ₹{Number(r.cgst_amount).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      ₹{Number(r.sgst_amount).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      ₹{Number(r.igst_amount).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{Number(r.total_tax).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* HSN-WISE TEXTILE GST REPORT */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            HSN-Wise Summary (GSTR-1 Table 12)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Textile commodity classification codes
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-2.5 px-3">HSN Code</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3 text-right">Taxable (₹)</th>
                  <th className="py-2.5 px-3 text-right">GST (₹)</th>
                  <th className="py-2.5 px-3 text-right">Total (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {hsnBreakdown.map((h: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                      {h.hsn_code}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                      {h.category_name} ({h.gst_rate}%)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium">
                      {h.total_quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                      ₹{Number(h.taxable_amount).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{Number(h.total_tax).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-slate-950 dark:text-white">
                      ₹{Number(h.total_amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
};

