import React, { useState, useEffect } from 'react';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Eye,
  CreditCard,
  Building,
  Phone,
  FileText,
  Printer,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  PackagePlus,
  ArrowUpDown,
  History,
  Trash2
} from 'lucide-react';
import api from '../services/api';
import { Supplier, PurchaseInvoice, PurchaseItem, Product, TextileUnit } from '../types';

export const PurchasesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'purchases' | 'suppliers'>('purchases');
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');

  // Modals state
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseInvoice | null>(null);
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);
  const [supplierStatement, setSupplierStatement] = useState<any>(null);

  const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>('bank_transfer');
  const [payRef, setPayRef] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');

  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Supplier Form state
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    company_name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: 'Tamil Nadu',
    state_code: '33',
    gstin: '',
    payment_terms: '30 Days Net'
  });

  // New Purchase Entry Form state
  const [purchaseForm, setPurchaseForm] = useState({
    purchase_invoice_number: '',
    purchase_date: new Date().toISOString().split('T')[0],
    supplier_id: '' as string | number,
    supplier_name: '',
    payment_status: 'unpaid' as 'paid' | 'partial' | 'unpaid',
    payment_method: 'bank_transfer',
    amount_paid: 0,
    additional_charges: 0,
    discount_amount: 0,
    notes: '',
    items: [] as {
      product_id: number;
      variant_id?: number;
      product_name: string;
      sku: string;
      hsn_code: string;
      unit: TextileUnit;
      quantity: number;
      purchase_cost: number;
      discount_percent: number;
      gst_rate: number;
      line_total: number;
    }[]
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [purRes, supRes, prodRes] = await Promise.all([
        api.get('/purchases'),
        api.get('/suppliers'),
        api.get('/products')
      ]);
      setPurchases(purRes.data.purchases || []);
      setSuppliers(supRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err) {
      console.error('Failed to load purchase/supplier data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered lists
  const filteredPurchases = purchases.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q ||
      p.purchase_invoice_number.toLowerCase().includes(q) ||
      p.supplier_name.toLowerCase().includes(q) ||
      (p.company_name && p.company_name.toLowerCase().includes(q));
    const matchStatus = !statusFilter || p.payment_status === statusFilter;
    const matchSupplier = !supplierFilter || String(p.supplier_id) === supplierFilter;
    return matchSearch && matchStatus && matchSupplier;
  });

  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase();
    return !q ||
      s.name.toLowerCase().includes(q) ||
      (s.company_name && s.company_name.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q)) ||
      (s.gstin && s.gstin.toLowerCase().includes(q)) ||
      (s.city && s.city.toLowerCase().includes(q));
  });

  // KPI Calculations
  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + (p.status !== 'cancelled' ? p.grand_total : 0), 0);
  const totalPaidAmount = purchases.reduce((sum, p) => sum + (p.status !== 'cancelled' ? p.amount_paid : 0), 0);
  const totalOutstandingToSuppliers = suppliers.reduce((sum, s) => sum + (s.outstanding_balance || 0), 0);

  // Open Supplier Form
  const handleOpenSupplierAdd = () => {
    setEditSupplier(null);
    setSupplierForm({
      name: '',
      company_name: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: 'Tamil Nadu',
      state_code: '33',
      gstin: '',
      payment_terms: '30 Days Net'
    });
    setShowSupplierModal(true);
  };

  const handleOpenSupplierEdit = (s: Supplier) => {
    setEditSupplier(s);
    setSupplierForm({
      name: s.name,
      company_name: s.company_name || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      city: s.city || '',
      state: s.state || 'Tamil Nadu',
      state_code: s.state_code || '33',
      gstin: s.gstin || '',
      payment_terms: s.payment_terms || '30 Days Net'
    });
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) return;
    setActionLoading(true);
    try {
      if (editSupplier) {
        await api.put(`/suppliers/${editSupplier.id}`, supplierForm);
        setFeedbackMsg({ type: 'success', text: 'Supplier updated successfully.' });
      } else {
        await api.post('/suppliers', supplierForm);
        setFeedbackMsg({ type: 'success', text: 'Supplier registered successfully.' });
      }
      setShowSupplierModal(false);
      fetchData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save supplier.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Open Supplier Statement Drawer
  const handleOpenStatement = async (s: Supplier) => {
    setStatementSupplier(s);
    try {
      const res = await api.get(`/suppliers/${s.id}/statement`);
      setSupplierStatement(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Record Supplier Payment
  const handlePaySupplier = async () => {
    if (!paySupplier || payAmount <= 0) return;
    setActionLoading(true);
    try {
      await api.post(`/suppliers/${paySupplier.id}/payment`, {
        amount: payAmount,
        payment_method: payMethod,
        reference_number: payRef,
        notes: payNotes
      });
      setFeedbackMsg({ type: 'success', text: `Payment of ₹${payAmount} recorded for ${paySupplier.name}.` });
      setPaySupplier(null);
      fetchData();
      if (statementSupplier && statementSupplier.id === paySupplier.id) {
        handleOpenStatement(paySupplier);
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.response?.data?.error || 'Payment recording failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Purchase
  const handleCancelPurchase = async (p: PurchaseInvoice) => {
    if (!window.confirm(`Are you sure you want to cancel purchase invoice "${p.purchase_invoice_number}"? This will automatically reverse stock additions.`)) return;
    try {
      await api.post(`/purchases/${p.id}/cancel`, { reason: 'User cancelled from purchase register' });
      setFeedbackMsg({ type: 'success', text: `Purchase invoice ${p.purchase_invoice_number} cancelled and stock reversed.` });
      fetchData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.response?.data?.error || 'Failed to cancel purchase invoice.' });
    }
  };

  // New Purchase Entry Line Items calculation
  const addItemToPurchase = () => {
    const defaultProd = products[0];
    if (!defaultProd) return;
    setPurchaseForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: defaultProd.id,
          product_name: defaultProd.name,
          sku: defaultProd.sku,
          hsn_code: defaultProd.hsn_code || '5208',
          unit: defaultProd.unit,
          quantity: 10,
          purchase_cost: defaultProd.purchase_price || 100,
          discount_percent: 0,
          gst_rate: defaultProd.gst_rate || 5,
          line_total: Math.round(10 * (defaultProd.purchase_price || 100) * (1 + (defaultProd.gst_rate || 5) / 100) * 100) / 100
        }
      ]
    }));
  };

  const updatePurchaseItem = (index: number, fields: any) => {
    setPurchaseForm(prev => {
      const updated = [...prev.items];
      const item = { ...updated[index], ...fields };

      // If product_id changed, auto-fill product details
      if (fields.product_id) {
        const prod = products.find(p => p.id === Number(fields.product_id));
        if (prod) {
          item.product_name = prod.name;
          item.sku = prod.sku;
          item.hsn_code = prod.hsn_code || '5208';
          item.unit = prod.unit;
          item.purchase_cost = prod.purchase_price || 0;
          item.gst_rate = prod.gst_rate || 5;
        }
      }

      const qty = Number(item.quantity) || 0;
      const cost = Number(item.purchase_cost) || 0;
      const disc = Number(item.discount_percent) || 0;
      const gst = Number(item.gst_rate) || 0;

      const taxable = (qty * cost) * (1 - disc / 100);
      const tax = taxable * (gst / 100);
      item.line_total = Math.round((taxable + tax) * 100) / 100;

      updated[index] = item;
      return { ...prev, items: updated };
    });
  };

  const removePurchaseItem = (index: number) => {
    setPurchaseForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Calculate Purchase Form totals
  const purchaseSubtotal = purchaseForm.items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.purchase_cost) || 0) * (1 - (Number(item.discount_percent) || 0) / 100)), 0);
  const purchaseTaxTotal = purchaseForm.items.reduce((sum, item) => {
    const taxable = (Number(item.quantity) || 0) * (Number(item.purchase_cost) || 0) * (1 - (Number(item.discount_percent) || 0) / 100);
    return sum + (taxable * ((Number(item.gst_rate) || 0) / 100));
  }, 0);
  const purchaseGrandTotal = Math.round((purchaseSubtotal + purchaseTaxTotal + Number(purchaseForm.additional_charges) - Number(purchaseForm.discount_amount)) * 100) / 100;

  // Open New Purchase modal
  const handleOpenNewPurchase = () => {
    const defaultSup = suppliers[0];
    const defaultProd = products[0];
    setPurchaseForm({
      purchase_invoice_number: `PUR-${Math.floor(1000 + Math.random() * 9000)}`,
      purchase_date: new Date().toISOString().split('T')[0],
      supplier_id: defaultSup ? defaultSup.id : '',
      supplier_name: defaultSup ? defaultSup.name : '',
      payment_status: 'unpaid',
      payment_method: 'bank_transfer',
      amount_paid: 0,
      additional_charges: 0,
      discount_amount: 0,
      notes: '',
      items: defaultProd ? [
        {
          product_id: defaultProd.id,
          product_name: defaultProd.name,
          sku: defaultProd.sku,
          hsn_code: defaultProd.hsn_code || '5208',
          unit: defaultProd.unit,
          quantity: 20,
          purchase_cost: defaultProd.purchase_price || 150,
          discount_percent: 0,
          gst_rate: defaultProd.gst_rate || 5,
          line_total: Math.round(20 * (defaultProd.purchase_price || 150) * (1 + (defaultProd.gst_rate || 5) / 100) * 100) / 100
        }
      ] : []
    });
    setShowPurchaseModal(true);
  };

  // Submit Purchase Entry
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (purchaseForm.items.length === 0) {
      alert('Please add at least one line item to the purchase invoice.');
      return;
    }
    setActionLoading(true);
    try {
      const selectedSup = suppliers.find(s => s.id === Number(purchaseForm.supplier_id));
      const payload = {
        purchase_invoice_number: purchaseForm.purchase_invoice_number.trim(),
        purchase_date: purchaseForm.purchase_date,
        supplier_id: purchaseForm.supplier_id || null,
        supplier_name: selectedSup ? selectedSup.name : purchaseForm.supplier_name,
        payment_status: purchaseForm.payment_status,
        payment_method: purchaseForm.payment_method,
        amount_paid: purchaseForm.payment_status === 'paid' ? purchaseGrandTotal : (Number(purchaseForm.amount_paid) || 0),
        additional_charges: Number(purchaseForm.additional_charges) || 0,
        discount_amount: Number(purchaseForm.discount_amount) || 0,
        notes: purchaseForm.notes,
        items: purchaseForm.items
      };

      await api.post('/purchases', payload);
      setFeedbackMsg({ type: 'success', text: `Purchase invoice ${payload.purchase_invoice_number} saved. Stock inward updated automatically!` });
      setShowPurchaseModal(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save purchase bill.');
    } finally {
      setActionLoading(false);
    }
  };

  // Print Statement Helper
  const handlePrintSupplierStatement = () => {
    if (!statementSupplier || !supplierStatement) return;
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Supplier Khata Statement - ${statementSupplier.name}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; margin: 24px; color: #111; font-size: 13px; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 20px; font-weight: 900; text-transform: uppercase; }
          .sub { font-size: 11px; color: #444; margin-top: 2px; }
          .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { background: #f0f0f0; border: 1px solid #ddd; padding: 8px 6px; font-weight: bold; font-size: 11px; text-transform: uppercase; }
          td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .closing { margin-top: 16px; border-top: 2px solid #000; padding-top: 8px; display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
          @media print { body { margin: 10mm; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">SRI LAKSHMI SILKS & TEXTILES</div>
          <div class="sub">Door No. 42/1, MG Road, Commercial Center, Coimbatore - 641001</div>
          <div class="sub">GSTIN: 33AABCU9603R1ZM • Ph: +91 98421 55678</div>
          <div style="margin-top: 8px; font-weight: bold; font-size: 14px;">SUPPLIER STATEMENT OF ACCOUNT / KHATA</div>
        </div>

        <div class="meta">
          <div>
            <strong>Supplier: </strong>${statementSupplier.name} (${statementSupplier.company_name || 'N/A'})<br/>
            ${statementSupplier.phone ? `Mobile: +91 ${statementSupplier.phone}<br/>` : ''}
            ${statementSupplier.gstin ? `GSTIN: ${statementSupplier.gstin}<br/>` : ''}
            ${statementSupplier.city ? `City: ${statementSupplier.city}, ${statementSupplier.state || ''}` : ''}
          </div>
          <div style="text-align: right;">
            <strong>Statement Date: </strong>${new Date().toLocaleDateString()}<br/>
            <strong>Total Purchases: </strong>₹${Number(statementSupplier.total_purchases).toFixed(2)}<br/>
            <strong>Outstanding Balance Payable: </strong><span style="color: #b91c1c; font-weight: bold;">₹${Number(statementSupplier.outstanding_balance).toFixed(2)}</span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 15%;">Date</th>
              <th style="width: 20%;">Reference</th>
              <th style="width: 35%;">Particulars</th>
              <th class="text-right" style="width: 10%;">Purchase (₹)</th>
              <th class="text-right" style="width: 10%;">Paid (₹)</th>
              <th class="text-right" style="width: 10%;">Balance (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${(supplierStatement.statement || []).map((e: any) => `
              <tr>
                <td>${e.date}</td>
                <td style="font-family: monospace;">${e.reference}</td>
                <td>${e.description}</td>
                <td class="text-right">${e.debit > 0 ? `₹${e.debit.toFixed(2)}` : '-'}</td>
                <td class="text-right" style="color: #15803d;">${e.credit > 0 ? `₹${e.credit.toFixed(2)}` : '-'}</td>
                <td class="text-right bold" style="${(e.running_balance || 0) > 0 ? 'color: #b91c1c;' : ''}">₹${Number(e.running_balance || 0).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="closing">
          <span>NET OUTSTANDING PAYABLE BALANCE:</span>
          <span>₹${Number(statementSupplier.outstanding_balance).toFixed(2)}</span>
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
      
      {/* Top Header & KPIs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Purchases & Supplier Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Record supplier purchase bills, automate inventory stock-in, track supplier dues, and manage statements.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={handleOpenSupplierAdd}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold shadow-xs hover:bg-slate-50 cursor-pointer"
          >
            <Building className="w-3.5 h-3.5" />
            + Add Supplier
          </button>

          <button
            onClick={handleOpenNewPurchase}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer"
          >
            <PackagePlus className="w-4 h-4" />
            + Record Purchase Entry
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
          <span className="text-xs text-slate-500 font-semibold uppercase block">Total Purchases</span>
          <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-1">
            ₹{totalPurchasesAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">{purchases.length} total bills</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Total Amount Paid</span>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
            ₹{totalPaidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Settled with suppliers</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-red-600 font-semibold uppercase block">Outstanding Payables</span>
          <div className="text-xl font-black text-red-600 font-mono mt-1">
            ₹{totalOutstandingToSuppliers.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Pending dues to suppliers</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-500 font-semibold uppercase block">Active Suppliers</span>
          <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 font-mono mt-1">
            {suppliers.length}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Registered textile vendors</span>
        </div>
      </div>

      {/* Main Tabs Header */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('purchases')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'purchases'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Purchase Bills Register ({purchases.length})
        </button>

        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'suppliers'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Suppliers & Khata Ledgers ({suppliers.length})
        </button>
      </div>

      {/* SEARCH & FILTER BAR */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'purchases' ? "Search purchase invoice #, supplier name..." : "Search supplier, phone, company, GSTIN..."}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {activeTab === 'purchases' && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
            >
              <option value="">All Payment Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid / Credit</option>
            </select>

            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium max-w-[200px]"
            >
              <option value="">All Suppliers ({suppliers.length})</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: PURCHASES REGISTER */}
      {activeTab === 'purchases' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-3 px-3">Invoice No</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Supplier</th>
                  <th className="py-3 px-3 text-center">Items</th>
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
                    <td colSpan={11} className="py-12 text-center text-slate-400">Loading purchase register...</td>
                  </tr>
                ) : filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">No purchase invoices found. Click "+ Record Purchase Entry" to add one.</td>
                  </tr>
                ) : (
                  filteredPurchases.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {p.purchase_invoice_number}
                      </td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{p.purchase_date}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">{p.supplier_name}</div>
                        {p.company_name && <div className="text-[10px] text-slate-400">{p.company_name}</div>}
                      </td>
                      <td className="py-3 px-3 text-center font-mono">{p.total_items_count}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        ₹{Number(p.subtotal).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        ₹{Number(p.tax_amount).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-950 dark:text-white">
                        ₹{Number(p.grand_total).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-600 font-semibold">
                        ₹{Number(p.amount_paid).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        {p.balance_due > 0 ? (
                          <span className="text-red-600">₹{Number(p.balance_due).toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-400">₹0.00</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          p.status === 'cancelled'
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                            : p.payment_status === 'paid'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : p.payment_status === 'partial'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                        }`}>
                          {p.status === 'cancelled' ? 'Cancelled' : p.payment_status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setSelectedPurchase(p)}
                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                            title="View Purchase Bill Items & Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {p.status !== 'cancelled' && (
                            <button
                              onClick={() => handleCancelPurchase(p)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                              title="Cancel Purchase & Reverse Stock Inward"
                            >
                              <Trash2 className="w-4 h-4" />
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
      )}

      {/* TAB 2: SUPPLIERS REGISTER & KHATA */}
      {activeTab === 'suppliers' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                  <th className="py-3 px-3">Supplier Name</th>
                  <th className="py-3 px-3">Company</th>
                  <th className="py-3 px-3">Contact</th>
                  <th className="py-3 px-3">GSTIN</th>
                  <th className="py-3 px-3 text-right">Total Purchases (₹)</th>
                  <th className="py-3 px-3 text-right">Total Paid (₹)</th>
                  <th className="py-3 px-3 text-right">Outstanding Dues (₹)</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">Loading suppliers...</td>
                  </tr>
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">No suppliers found.</td>
                  </tr>
                ) : (
                  filteredSuppliers.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                        {s.name}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-medium">
                        {s.company_name || '-'}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {s.phone || '-'}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {s.gstin || '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        ₹{Number(s.total_purchases).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-600 font-semibold">
                        ₹{Number(s.total_paid).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        {s.outstanding_balance > 0 ? (
                          <span className="text-red-600">₹{Number(s.outstanding_balance).toFixed(2)}</span>
                        ) : (
                          <span className="text-slate-400">₹0.00</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenStatement(s)}
                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                            title="View Khata Ledger Statement"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Statement
                          </button>

                          {s.outstanding_balance > 0 && (
                            <button
                              onClick={() => {
                                setPaySupplier(s);
                                setPayAmount(s.outstanding_balance);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1 shadow-xs cursor-pointer"
                              title="Record payment to supplier"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Pay
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenSupplierEdit(s)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md"
                            title="Edit Supplier Profile"
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
      )}

      {/* MODAL 1: NEW PURCHASE INVOICE ENTRY */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-indigo-600">
                <PackagePlus className="w-6 h-6" />
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base sm:text-lg">
                  Record Purchase Bill (Stock Inward)
                </h3>
              </div>
              <button onClick={() => setShowPurchaseModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSavePurchase} className="space-y-4 text-xs">
              
              {/* Header Info: Supplier, Inv Number, Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Select Supplier <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={purchaseForm.supplier_id}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier_id: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} {s.company_name ? `(${s.company_name})` : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Supplier Invoice / Bill No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={purchaseForm.purchase_invoice_number}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_invoice_number: e.target.value.toUpperCase() })}
                    placeholder="e.g. SL-9842"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Purchase Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseForm.purchase_date}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                    Purchased Goods / Fabric Items ({purchaseForm.items.length})
                  </span>
                  <button
                    type="button"
                    onClick={addItemToPurchase}
                    className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    + Add Item Line
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase font-bold text-[10px]">
                        <th className="py-2 px-2 min-w-[180px]">Product</th>
                        <th className="py-2 px-2 w-16 text-right">Qty</th>
                        <th className="py-2 px-2 w-16 text-center">Unit</th>
                        <th className="py-2 px-2 w-24 text-right">Unit Cost (₹)</th>
                        <th className="py-2 px-2 w-16 text-right">Disc%</th>
                        <th className="py-2 px-2 w-16 text-center">GST%</th>
                        <th className="py-2 px-2 w-24 text-right">Line Total (₹)</th>
                        <th className="py-2 px-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {purchaseForm.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-2">
                            <select
                              value={item.product_id}
                              onChange={(e) => updatePurchaseItem(idx, { product_id: Number(e.target.value) })}
                              className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                            >
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              min="0.1"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => updatePurchaseItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                              className="w-16 px-1.5 py-1 text-right rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                            />
                          </td>
                          <td className="py-2 px-2 text-center text-slate-500 font-mono">
                            {item.unit}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.purchase_cost}
                              onChange={(e) => updatePurchaseItem(idx, { purchase_cost: parseFloat(e.target.value) || 0 })}
                              className="w-20 px-1.5 py-1 text-right rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discount_percent}
                              onChange={(e) => updatePurchaseItem(idx, { discount_percent: parseFloat(e.target.value) || 0 })}
                              className="w-14 px-1.5 py-1 text-right rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <select
                              value={item.gst_rate}
                              onChange={(e) => updatePurchaseItem(idx, { gst_rate: parseFloat(e.target.value) || 0 })}
                              className="px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                            >
                              <option value="0">0%</option>
                              <option value="5">5%</option>
                              <option value="12">12%</option>
                              <option value="18">18%</option>
                              <option value="28">28%</option>
                            </select>
                          </td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-slate-950 dark:text-white">
                            ₹{item.line_total.toFixed(2)}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => removePurchaseItem(idx)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Summary & Payment Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Payment Status to Supplier
                    </label>
                    <select
                      value={purchaseForm.payment_status}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, payment_status: e.target.value as any })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                    >
                      <option value="unpaid">Credit / Unpaid (Khata Balance Due)</option>
                      <option value="paid">Fully Paid Now</option>
                      <option value="partial">Partially Paid</option>
                    </select>
                  </div>

                  {purchaseForm.payment_status !== 'unpaid' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                          Amount Paid Now (₹)
                        </label>
                        <input
                          type="number"
                          value={purchaseForm.amount_paid}
                          onChange={(e) => setPurchaseForm({ ...purchaseForm, amount_paid: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                          Payment Method
                        </label>
                        <select
                          value={purchaseForm.payment_method}
                          onChange={(e) => setPurchaseForm({ ...purchaseForm, payment_method: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white uppercase font-medium"
                        >
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="upi">UPI</option>
                          <option value="cheque">Cheque</option>
                          <option value="cash">Cash</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Notes / Transport details</label>
                    <input
                      type="text"
                      value={purchaseForm.notes}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                      placeholder="e.g. Received via VRL Logistics, LR #8942"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-4">
                  <div className="flex justify-between">
                    <span>Taxable Subtotal:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">₹{purchaseSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total GST:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">₹{purchaseTaxTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>Additional Freight/Charges:</span>
                    <input
                      type="number"
                      value={purchaseForm.additional_charges}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, additional_charges: parseFloat(e.target.value) || 0 })}
                      className="w-20 px-2 py-0.5 text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>Discount:</span>
                    <input
                      type="number"
                      value={purchaseForm.discount_amount}
                      onChange={(e) => setPurchaseForm({ ...purchaseForm, discount_amount: parseFloat(e.target.value) || 0 })}
                      className="w-20 px-2 py-0.5 text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>

                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 flex justify-between text-sm font-black text-slate-950 dark:text-white">
                    <span>Grand Total:</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">₹{purchaseGrandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || purchaseForm.items.length === 0}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md"
                >
                  {actionLoading ? 'Saving...' : 'Confirm & Stock Inward (Auto Stock Update)'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT SUPPLIER */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                {editSupplier ? 'Edit Supplier Details' : 'Register New Supplier'}
              </h3>
              <button onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Contact Person Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                    placeholder="e.g. K. Narayanan"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Mill / Company Name
                  </label>
                  <input
                    type="text"
                    value={supplierForm.company_name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, company_name: e.target.value })}
                    placeholder="e.g. Coimbatore Weaving Mills"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Phone / Mobile
                  </label>
                  <input
                    type="text"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    placeholder="Mobile number"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={supplierForm.gstin}
                    onChange={(e) => setSupplierForm({ ...supplierForm, gstin: e.target.value.toUpperCase() })}
                    placeholder="15-digit GSTIN"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">City</label>
                  <input
                    type="text"
                    value={supplierForm.city}
                    onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value })}
                    placeholder="e.g. Surat"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Payment Terms</label>
                  <input
                    type="text"
                    value={supplierForm.payment_terms}
                    onChange={(e) => setSupplierForm({ ...supplierForm, payment_terms: e.target.value })}
                    placeholder="e.g. 15 Days / Net 30"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md"
                >
                  {actionLoading ? 'Saving...' : editSupplier ? 'Update Supplier' : 'Register Supplier'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: SUPPLIER PAYMENT MODAL */}
      {paySupplier && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <CreditCard className="w-6 h-6" />
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Record Supplier Payment</h3>
                <p className="text-xs text-slate-500">{paySupplier.name} • Total Dues: ₹{paySupplier.outstanding_balance}</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Payment Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  max={paySupplier.outstanding_balance}
                  value={payAmount}
                  onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-base"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Paid Via</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white uppercase font-medium"
                >
                  <option value="bank_transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="cheque">Cheque</option>
                  <option value="upi">UPI / QR</option>
                  <option value="cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Transaction Ref / Cheque No</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g. UTR-98242"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPaySupplier(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || payAmount <= 0}
                onClick={handlePaySupplier}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md text-xs"
              >
                {actionLoading ? 'Recording...' : 'Confirm Supplier Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SUPPLIER STATEMENT / LEDGER DRAWER */}
      {statementSupplier && supplierStatement && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  Supplier Statement: {statementSupplier.name} ({statementSupplier.company_name || 'Vendor'})
                </h3>
                <div className="text-xs text-slate-500">
                  GSTIN: {statementSupplier.gstin || 'None'} • Ph: {statementSupplier.phone || 'N/A'} • Dues: ₹{statementSupplier.outstanding_balance}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintSupplierStatement}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Statement
                </button>
                <button onClick={() => setStatementSupplier(null)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                    <th className="py-2 px-2">Date</th>
                    <th className="py-2 px-2">Reference</th>
                    <th className="py-2 px-2">Particulars</th>
                    <th className="py-2 px-2 text-right">Purchase (₹)</th>
                    <th className="py-2 px-2 text-right">Payment (₹)</th>
                    <th className="py-2 px-2 text-right">Balance Due (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(supplierStatement.statement || []).map((e: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-2 text-slate-500 whitespace-nowrap">{e.date}</td>
                      <td className="py-2 px-2 font-mono font-bold text-slate-900 dark:text-white">{e.reference}</td>
                      <td className="py-2 px-2 text-slate-700 dark:text-slate-300">{e.description}</td>
                      <td className="py-2 px-2 text-right font-mono text-slate-900 dark:text-white">
                        {e.debit > 0 ? `₹${Number(e.debit).toFixed(2)}` : '-'}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-emerald-600 font-semibold">
                        {e.credit > 0 ? `₹${Number(e.credit).toFixed(2)}` : '-'}
                      </td>
                      <td className={`py-2 px-2 text-right font-mono font-bold ${e.running_balance > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        ₹{Number(e.running_balance).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
              <span className="font-bold">Total Net Payables:</span>
              <span className="font-mono font-black text-red-600 text-sm">₹{Number(statementSupplier.outstanding_balance).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: PURCHASE BILL VIEW */}
      {selectedPurchase && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                  Purchase Invoice #{selectedPurchase.purchase_invoice_number}
                </h3>
                <div className="text-xs text-slate-500">
                  Supplier: {selectedPurchase.supplier_name} • Date: {selectedPurchase.purchase_date}
                </div>
              </div>
              <button onClick={() => setSelectedPurchase(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[10px]">
                    <th className="py-2 px-2">Item</th>
                    <th className="py-2 px-2 text-right">Qty</th>
                    <th className="py-2 px-2 text-right">Cost (₹)</th>
                    <th className="py-2 px-2 text-center">GST</th>
                    <th className="py-2 px-2 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(selectedPurchase.items || []).map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-2">
                        <div className="font-bold text-slate-900 dark:text-white">{item.product_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">SKU: {item.sku} • HSN: {item.hsn_code}</div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold">{item.quantity} {item.unit}</td>
                      <td className="py-2 px-2 text-right font-mono">₹{Number(item.purchase_cost).toFixed(2)}</td>
                      <td className="py-2 px-2 text-center font-mono">{item.gst_rate}%</td>
                      <td className="py-2 px-2 text-right font-mono font-bold">₹{Number(item.total_cost).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between"><span>Taxable:</span><span className="font-mono">₹{Number(selectedPurchase.subtotal).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>GST:</span><span className="font-mono">₹{Number(selectedPurchase.tax_amount).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-sm border-t pt-1">
                <span>Grand Total:</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">₹{Number(selectedPurchase.grand_total).toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-2 text-right border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedPurchase(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
