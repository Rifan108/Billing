import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Eye,
  CreditCard,
  Phone,
  MapPin,
  FileSpreadsheet,
  AlertCircle,
  Building,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import api from '../services/api';
import { Customer, Invoice } from '../types';

interface CustomersPageProps {
  onViewInvoice: (inv: Invoice) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({ onViewInvoice }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyBalanceDue, setOnlyBalanceDue] = useState(false);

  // Customer Details Drawer
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Add / Edit Customer Modal
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: 'Tamil Nadu',
    state_code: '33',
    gstin: ''
  });

  // Settle Dues Modal
  const [settleCustomer, setSettleCustomer] = useState<Customer | null>(null);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleMethod, setSettleMethod] = useState('cash');
  const [settleRef, setSettleRef] = useState('');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (onlyBalanceDue) params.append('has_balance', 'true');

      const res = await api.get(`/customers?${params.toString()}`);
      setCustomers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [onlyBalanceDue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Open Customer Drawer
  const handleOpenDetails = async (c: Customer) => {
    setSelectedCustomer(c);
    setDrawerLoading(true);
    try {
      const res = await api.get(`/customers/${c.id}`);
      setCustomerInvoices(res.data.invoices || []);
      setCustomerPayments(res.data.payments || []);
    } catch (err) {
      console.error(err);
    } finally {
      setDrawerLoading(false);
    }
  };

  // Open Create Customer
  const handleOpenAdd = () => {
    setEditCustomer(null);
    setCustomerForm({
      name: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: 'Tamil Nadu',
      state_code: '33',
      gstin: ''
    });
    setShowCustomerModal(true);
  };

  // Open Edit Customer
  const handleOpenEdit = (c: Customer) => {
    setEditCustomer(c);
    setCustomerForm({
      name: c.name,
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || 'Tamil Nadu',
      state_code: c.state_code || '33',
      gstin: c.gstin || ''
    });
    setShowCustomerModal(true);
  };

  // Save Customer Form
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name.trim()) return;
    setSaving(true);
    try {
      if (editCustomer) {
        await api.put(`/customers/${editCustomer.id}`, customerForm);
        setMsg({ type: 'success', text: 'Customer updated successfully.' });
      } else {
        await api.post('/customers', customerForm);
        setMsg({ type: 'success', text: 'Customer registered successfully.' });
      }
      setShowCustomerModal(false);
      fetchCustomers();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save customer.' });
    } finally {
      setSaving(false);
    }
  };

  // Settle Balance
  const handleSettle = async () => {
    if (!settleCustomer || settleAmount <= 0) return;
    setSaving(true);
    try {
      await api.post(`/customers/${settleCustomer.id}/payment`, {
        amount: settleAmount,
        payment_method: settleMethod,
        reference_number: settleRef
      });
      setMsg({ type: 'success', text: `Payment of ₹${settleAmount} credited successfully.` });
      setSettleCustomer(null);
      fetchCustomers();
      if (selectedCustomer && selectedCustomer.id === settleCustomer.id) {
        handleOpenDetails(settleCustomer);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Payment failed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Customer Directory & Ledgers
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Maintain customer retail & wholesale accounts, purchase history, and outstanding credit balances.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add New Customer
        </button>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
          msg.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300'
            : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-300'
        }`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* SEARCH & FILTERS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer name, phone, GSTIN, city..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <label className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyBalanceDue}
            onChange={(e) => setOnlyBalanceDue(e.target.checked)}
            className="rounded text-indigo-600 focus:ring-indigo-500"
          />
          <span>Show Only Customers with Pending Dues</span>
        </label>

      </div>

      {/* CUSTOMERS TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                <th className="py-3 px-3">Customer Name</th>
                <th className="py-3 px-3">Mobile Number</th>
                <th className="py-3 px-3">Location / State</th>
                <th className="py-3 px-3">GSTIN (B2B)</th>
                <th className="py-3 px-3 text-right">Total Purchases (₹)</th>
                <th className="py-3 px-3 text-center">Bills</th>
                <th className="py-3 px-3 text-right">Outstanding (₹)</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Loading customers...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No customers found matching current filters.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    
                    {/* Name */}
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-950 dark:text-white text-sm">{c.name}</div>
                      {c.last_purchase_date && (
                        <span className="text-[10px] text-slate-400">Last visit: {c.last_purchase_date}</span>
                      )}
                    </td>

                    {/* Phone */}
                    <td className="py-3 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                      {c.phone ? `+91 ${c.phone}` : '-'}
                    </td>

                    {/* Location */}
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                      {c.city ? `${c.city}, ` : ''}{c.state || '-'}
                    </td>

                    {/* GSTIN */}
                    <td className="py-3 px-3 font-mono">
                      {c.gstin ? (
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">{c.gstin}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    {/* Total Purchases */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-950 dark:text-white">
                      ₹{Number(c.total_purchases).toLocaleString('en-IN')}
                    </td>

                    {/* Total Bills */}
                    <td className="py-3 px-3 text-center font-mono">
                      <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-semibold text-slate-700 dark:text-slate-300">
                        {c.total_bills}
                      </span>
                    </td>

                    {/* Outstanding Balance */}
                    <td className="py-3 px-3 text-right font-mono">
                      {c.outstanding_balance > 0 ? (
                        <span className="font-black text-red-600">₹{Number(c.outstanding_balance).toFixed(2)}</span>
                      ) : (
                        <span className="text-emerald-600 font-medium">₹0.00</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        
                        {/* View Profile & Ledger */}
                        <button
                          onClick={() => handleOpenDetails(c)}
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="View Invoices & Payments History"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Settle Balance Button */}
                        {c.outstanding_balance > 0 && (
                          <button
                            onClick={() => {
                              setSettleCustomer(c);
                              setSettleAmount(c.outstanding_balance);
                            }}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors"
                            title="Collect Pending Credit"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                        )}

                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEdit(c)}
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Edit Customer Profile"
                        >
                          Edit
                        </button>

                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CUSTOMER PROFILE & LEDGER DRAWER */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-lg">
                  {selectedCustomer.name}
                </h3>
                <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                  <span>Phone: {selectedCustomer.phone || 'N/A'}</span>
                  <span>GSTIN: {selectedCustomer.gstin || 'None'}</span>
                  <span>City: {selectedCustomer.city || 'N/A'}</span>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Quick Financial Summary */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <span className="text-slate-500 block">Total Purchases</span>
                <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  ₹{Number(selectedCustomer.total_purchases).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <span className="text-slate-500 block">Total Bills</span>
                <span className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {selectedCustomer.total_bills}
                </span>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-900">
                <span className="text-red-700 dark:text-red-400 block font-semibold">Outstanding Dues</span>
                <span className="text-base font-bold text-red-600 font-mono">
                  ₹{Number(selectedCustomer.outstanding_balance).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Invoices List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Purchase History ({customerInvoices.length} invoices)
              </h4>

              {drawerLoading ? (
                <div className="py-8 text-center text-slate-400 text-xs">Loading ledger...</div>
              ) : customerInvoices.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">No previous invoices for this customer.</div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                      <th className="py-2 px-2">Invoice No</th>
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2 text-right">Grand Total (₹)</th>
                      <th className="py-2 px-2 text-right">Paid (₹)</th>
                      <th className="py-2 px-2 text-right">Due (₹)</th>
                      <th className="py-2 px-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {customerInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-2 px-2 font-mono font-bold text-slate-950 dark:text-white">
                          {inv.invoice_number}
                        </td>
                        <td className="py-2 px-2 text-slate-500">{inv.invoice_date}</td>
                        <td className="py-2 px-2 text-right font-mono font-bold">
                          ₹{Number(inv.grand_total).toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-emerald-600 font-semibold">
                          ₹{Number(inv.amount_paid).toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-red-600 font-bold">
                          ₹{Number(inv.balance_due).toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-center uppercase text-[10px] font-bold">
                          {inv.status === 'active' ? inv.payment_status : inv.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ADD / EDIT CUSTOMER MODAL */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {editCustomer ? 'Edit Customer Details' : 'Register New Customer'}
              </h3>
              <button onClick={() => setShowCustomerModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Customer / Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                  placeholder="e.g. Ramesh Kumar or Royal Boutique"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="text"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    placeholder="10-digit phone"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    GSTIN Number (B2B)
                  </label>
                  <input
                    type="text"
                    value={customerForm.gstin}
                    onChange={(e) => setCustomerForm({ ...customerForm, gstin: e.target.value.toUpperCase() })}
                    placeholder="15-digit GSTIN"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    City / Town
                  </label>
                  <input
                    type="text"
                    value={customerForm.city}
                    onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                    placeholder="e.g. Madurai"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={customerForm.state}
                    onChange={(e) => setCustomerForm({ ...customerForm, state: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Complete Address
                </label>
                <textarea
                  rows={2}
                  value={customerForm.address}
                  onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                  placeholder="Door No, Street, Landmark..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md"
                >
                  {saving ? 'Saving...' : editCustomer ? 'Update Profile' : 'Save Customer'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* SETTLE CUSTOMER DUES MODAL */}
      {settleCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Settle Customer Credit
                </h3>
                <p className="text-xs text-slate-500">
                  {settleCustomer.name} • Total Dues: ₹{settleCustomer.outstanding_balance}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Payment Amount (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  max={settleCustomer.outstanding_balance}
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
                  <option value="upi">UPI / QR Code</option>
                  <option value="card">Debit / Credit Card</option>
                  <option value="bank_transfer">Bank NEFT/RTGS</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Transaction Reference
                </label>
                <input
                  type="text"
                  value={settleRef}
                  onChange={(e) => setSettleRef(e.target.value)}
                  placeholder="Receipt # or UPI txn id"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSettleCustomer(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || settleAmount <= 0}
                onClick={handleSettle}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md text-xs"
              >
                {saving ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

