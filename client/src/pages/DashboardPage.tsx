import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Receipt,
  Package,
  FileSpreadsheet,
  Percent,
  Wallet,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  ShoppingBag,
  Eye,
  AlertTriangle
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import api from '../services/api';
import { Invoice } from '../types';

interface DashboardPageProps {
  onNavigate: (tab: string) => void;
  onViewInvoice: (inv: Invoice) => void;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, onViewInvoice }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = async () => {
    try {
      setRefreshing(true);
      const res = await api.get('/dashboard/metrics');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const today = data?.today || {};
  const yesterday = data?.yesterday || {};
  const outstanding = data?.outstanding || {};
  const inventory = data?.inventory || {};

  // Percentage change calculation
  const salesDiff = yesterday.sales > 0 ? ((today.today_sales - yesterday.sales) / yesterday.sales) * 100 : null;

  return (
    <div className="space-y-6">
      
      {/* Top Header & Fast Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Executive Business Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Real-time sales, tax ledger, inventory valuation, and payment performance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchMetrics}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold shadow-xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>

          <button
            onClick={() => onNavigate('billing')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95"
          >
            <Receipt className="w-4 h-4" />
            Create Bill
          </button>
        </div>
      </div>

      {/* METRICS STATS CARDS GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Today's Sales */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Today's Sales</span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono">
            ₹{Number(today.today_sales || 0).toLocaleString('en-IN')}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs">
            {salesDiff !== null ? (
              <span className={`inline-flex items-center font-bold ${salesDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {salesDiff >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {Math.abs(salesDiff).toFixed(1)}% vs yest
              </span>
            ) : (
              <span className="text-slate-400">First day sales</span>
            )}
            <span className="text-slate-400 dark:text-slate-500">• {today.today_invoices || 0} bills</span>
          </div>
        </div>

        {/* Total GST Collected Today */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Today's GST Tax</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            ₹{Number(today.today_gst || 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-mono flex flex-wrap gap-x-2">
            <span>CGST: ₹{Number(today.today_cgst || 0).toFixed(1)}</span>
            <span>SGST: ₹{Number(today.today_sgst || 0).toFixed(1)}</span>
            {today.today_igst > 0 && <span>IGST: ₹{Number(today.today_igst).toFixed(1)}</span>}
          </div>
        </div>

        {/* Items Sold & Avg Bill */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Avg Bill Value</span>
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono">
            ₹{Number(today.today_avg_bill || 0).toFixed(0)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Total Items Sold: <span className="font-bold text-slate-800 dark:text-slate-200">{today.today_items_count || 0} units</span>
          </div>
        </div>

        {/* Customer Dues / Outstanding */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Pending Dues</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            ₹{Number(outstanding.total_outstanding || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Across {outstanding.customers_with_dues || 0} customers with balance
          </div>
        </div>

        {/* Total Inventory Value */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Inventory Retail Value</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono">
            ₹{Number(inventory.inventory_retail_value || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Cost: ₹{Number(inventory.inventory_cost_value || 0).toLocaleString('en-IN')} • {inventory.total_active_products || 0} Items
          </div>
        </div>

        {/* Today's Discounts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Today's Discounts</span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
            ₹{Number(today.today_discounts || 0).toFixed(2)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Product + Invoice level reductions
          </div>
        </div>

        {/* Low Stock Alerts Count */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Stock Health</span>
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono">
            {inventory.low_stock_count || 0} <span className="text-xs font-normal text-slate-500">Low</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {inventory.out_of_stock_count || 0} products out of stock
          </div>
        </div>

        {/* Quick Invoicing Shortcut Tile */}
        <div
          onClick={() => onNavigate('billing')}
          className="bg-linear-to-br from-indigo-600 to-indigo-800 text-white rounded-2xl p-4 shadow-md shadow-indigo-600/30 cursor-pointer hover:shadow-lg transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-100">Fast Terminal</span>
            <Receipt className="w-5 h-5 text-indigo-200" />
          </div>
          <div>
            <div className="text-lg font-bold">New Billing</div>
            <p className="text-xs text-indigo-200 mt-0.5">Quick barcode & cloth entry</p>
          </div>
          <div className="text-[11px] font-semibold text-indigo-100 flex items-center gap-1">
            Press F2 anytime →
          </div>
        </div>

      </div>

      {/* CHARTS ROW 1: Daily Sales & Monthly Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Daily Sales Overview */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Daily Sales Overview
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Revenue & Tax collection over the last 14 days
              </p>
            </div>
          </div>

          <div className="h-64">
            {data.daily_sales && data.daily_sales.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily_sales}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gstGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip formatter={(value: any) => [`₹${Number(value).toFixed(2)}`]} />
                  <Legend />
                  <Area type="monotone" dataKey="sales" name="Sales (₹)" stroke="#6366f1" fillOpacity={1} fill="url(#salesGrad)" />
                  <Area type="monotone" dataKey="gst" name="GST (₹)" stroke="#10b981" fillOpacity={1} fill="url(#gstGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No billing history in current period
              </div>
            )}
          </div>
        </div>

        {/* Monthly Revenue Performance */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Monthly Revenue Performance
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Annual financial breakdown by month
              </p>
            </div>
          </div>

          <div className="h-64">
            {data.monthly_revenue && data.monthly_revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly_revenue}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip formatter={(value: any) => [`₹${Number(value).toFixed(2)}`]} />
                  <Legend />
                  <Bar dataKey="sales" name="Total Sales (₹)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gst" name="GST Collected (₹)" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No monthly transactions recorded yet
              </div>
            )}
          </div>
        </div>

      </div>

      {/* CHARTS ROW 2: Payment Distribution & Category Distribution & Best-Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Payment Method Distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            Payment Methods
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            UPI vs Cash vs Card split
          </p>

          <div className="h-52">
            {data.payment_methods && data.payment_methods.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.payment_methods}
                    dataKey="total_amount"
                    nameKey="payment_method"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={((entry: any) => `${entry.payment_method ? String(entry.payment_method).toUpperCase() : ''}: ₹${entry.total_amount || 0}`) as any}
                  >
                    {data.payment_methods.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => `₹${Number(val).toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No payments recorded
              </div>
            )}
          </div>
        </div>

        {/* Best Selling Textile Items */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            Top Performing Textile Products
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Ranked by total sales revenue
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold">
                  <th className="py-2 px-3">Product Name</th>
                  <th className="py-2 px-3">Category</th>
                  <th className="py-2 px-3 text-right">Qty Sold</th>
                  <th className="py-2 px-3 text-right">Revenue (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.top_products && data.top_products.length > 0 ? (
                  data.top_products.map((p: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {p.product_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">{p.category_name}</td>
                      <td className="py-2.5 px-3 text-right font-medium">
                        {p.total_qty_sold} {p.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        ₹{Number(p.total_revenue).toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      No sales recorded yet. Start billing!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* RECENT INVOICES SECTION */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Recent Invoices
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Latest transactions generated at the counter
            </p>
          </div>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            View Full History →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold">
                <th className="py-2 px-3">Invoice No</th>
                <th className="py-2 px-3">Date & Time</th>
                <th className="py-2 px-3">Customer</th>
                <th className="py-2 px-3">Method</th>
                <th className="py-2 px-3 text-right">Amount (₹)</th>
                <th className="py-2 px-3 text-center">Status</th>
                <th className="py-2 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recent_invoices && data.recent_invoices.length > 0 ? (
                data.recent_invoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-3 font-mono font-bold text-slate-950 dark:text-white">
                      {inv.invoice_number}
                    </td>
                    <td className="py-3 px-3 text-slate-500">
                      {inv.invoice_date} {inv.invoice_time}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-200">
                      {inv.customer_name}
                    </td>
                    <td className="py-3 px-3 uppercase text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      {inv.payment_method}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                      ₹{Number(inv.grand_total).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        inv.status === 'cancelled'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                          : inv.payment_status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                      }`}>
                        {inv.status === 'cancelled' ? 'Cancelled' : inv.payment_status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => onViewInvoice(inv)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400"
                        title="View Thermal Receipt Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No invoices generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
