import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Download,
  Calendar,
  Layers,
  ShoppingBag,
  Users,
  Clock,
  RefreshCw
} from 'lucide-react';
import api from '../services/api';

export const SalesAnalyticsPage: React.FC = () => {
  const [reportType, setReportType] = useState<'daily' | 'monthly' | 'yearly' | 'product_wise' | 'category_wise' | 'customer_wise'>('daily');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/reports/sales?type=${reportType}`);
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType]);

  const handleExport = (format: 'xlsx' | 'csv') => {
    window.open(`/api/reports/export?type=${reportType}&format=${format}`, '_blank');
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Comprehensive Business Analytics
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Multi-dimensional reporting across timelines, textile product lines, fabric categories, and customer portfolios.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => handleExport('xlsx')}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            Excel Export
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            CSV Export
          </button>
        </div>
      </div>

      {/* REPORT TYPE SELECTOR TABS */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl text-xs font-semibold">
        {[
          { id: 'daily', label: 'Daily Sales', icon: Clock },
          { id: 'monthly', label: 'Monthly Breakdown', icon: Calendar },
          { id: 'yearly', label: 'Yearly Performance', icon: TrendingUp },
          { id: 'product_wise', label: 'Product-Wise Sales', icon: ShoppingBag },
          { id: 'category_wise', label: 'Category-Wise Sales', icon: Layers },
          { id: 'customer_wise', label: 'Customer-Wise Sales', icon: Users }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = reportType === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setReportType(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ANALYTICS DATA TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {reportType === 'daily' || reportType === 'monthly' || reportType === 'yearly' ? (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-3 px-3">Timeline Period</th>
                  <th className="py-3 px-3 text-center">Invoices</th>
                  <th className="py-3 px-3 text-center">Items Sold</th>
                  <th className="py-3 px-3 text-right">Taxable Value (₹)</th>
                  <th className="py-3 px-3 text-right">GST Collected (₹)</th>
                  <th className="py-3 px-3 text-right">Discounts (₹)</th>
                  <th className="py-3 px-3 text-right">Gross Sales (₹)</th>
                  <th className="py-3 px-3 text-right">Avg Bill Value (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">Loading reports...</td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">No records found.</td>
                  </tr>
                ) : (
                  data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white font-mono">{row.period}</td>
                      <td className="py-3 px-3 text-center font-mono font-medium">{row.invoice_count}</td>
                      <td className="py-3 px-3 text-center font-mono">{row.total_items}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">₹{Number(row.taxable_amount).toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">₹{Number(row.gst_collected).toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-mono text-rose-600">₹{Number(row.total_discount).toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-950 dark:text-white text-sm">₹{Number(row.total_sales).toLocaleString('en-IN')}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">₹{Number(row.avg_bill_value).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : reportType === 'product_wise' ? (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-3 px-3">Product Name</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">HSN Code</th>
                  <th className="py-3 px-3 text-right">Units Sold</th>
                  <th className="py-3 px-3 text-right">Taxable Sales (₹)</th>
                  <th className="py-3 px-3 text-right">GST (₹)</th>
                  <th className="py-3 px-3 text-right">Total Revenue (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-bold text-slate-950 dark:text-white">{row.product_name}</td>
                    <td className="py-3 px-3 text-slate-500">{row.category_name}</td>
                    <td className="py-3 px-3 font-mono">{row.hsn_code}</td>
                    <td className="py-3 px-3 text-right font-mono font-medium">{row.total_quantity_sold} {row.unit}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">₹{Number(row.total_taxable).toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 font-semibold">₹{Number(row.total_tax).toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono font-black text-indigo-600 dark:text-indigo-400 text-sm">₹{Number(row.total_revenue).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : reportType === 'category_wise' ? (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-3 px-3">Textile Category</th>
                  <th className="py-3 px-3 text-right">Total Units Sold</th>
                  <th className="py-3 px-3 text-right">Taxable Value (₹)</th>
                  <th className="py-3 px-3 text-right">GST Collected (₹)</th>
                  <th className="py-3 px-3 text-right">Total Revenue (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-bold text-slate-950 dark:text-white">{row.category_name}</td>
                    <td className="py-3 px-3 text-right font-mono font-medium">{row.total_quantity_sold}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">₹{Number(row.total_taxable).toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 font-semibold">₹{Number(row.total_tax).toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono font-black text-indigo-600 dark:text-indigo-400 text-sm">₹{Number(row.total_revenue).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-3 px-3">Customer Name</th>
                  <th className="py-3 px-3">Mobile</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3 text-center">Bills</th>
                  <th className="py-3 px-3 text-right">Total Billed (₹)</th>
                  <th className="py-3 px-3 text-right">Amount Paid (₹)</th>
                  <th className="py-3 px-3 text-right">Balance Due (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 font-bold text-slate-950 dark:text-white">{row.customer_name}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{row.customer_phone || '-'}</td>
                    <td className="py-3 px-3 text-slate-500">{row.city || row.state || '-'}</td>
                    <td className="py-3 px-3 text-center font-mono font-medium">{row.invoice_count}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">₹{Number(row.total_billed).toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 font-semibold">₹{Number(row.total_paid).toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 text-right font-mono text-red-600 font-bold">₹{Number(row.outstanding_balance).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
};

