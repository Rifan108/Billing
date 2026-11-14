import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Printer,
  Receipt,
  User,
  Percent,
  Check,
  AlertCircle,
  CreditCard,
  Building,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import api from '../services/api';
import { Product, Customer, ShopSettings, TextileUnit, PaymentMethod, Invoice } from '../types';

interface BillingPageProps {
  onInvoiceCreated: (inv: Invoice, autoPrint?: boolean) => void;
}

interface BillItem {
  product_id?: number;
  product_name: string;
  sku: string;
  hsn_code: string;
  category_name: string;
  unit: TextileUnit;
  quantity: number;
  rate: number;
  discount_type: 'flat' | 'percent';
  discount_value: number;
  gst_rate: number;
  is_tax_inclusive: boolean;

  // Computed fields
  raw_subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  final_amount: number;
}

const TEXTILE_UNITS: TextileUnit[] = [
  'Pieces',
  'Meters',
  'Yards',
  'Kilograms',
  'Sets',
  'Rolls',
  'Dozens'
];

const GST_SLABS = [0, 5, 12, 18, 28];

export const BillingPage: React.FC<BillingPageProps> = ({ onInvoiceCreated }) => {
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [states, setStates] = useState<any[]>([]);

  // Customer Details
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('Tamil Nadu');
  const [placeOfSupplyCode, setPlaceOfSupplyCode] = useState('33');

  // Customer Autocomplete / Search
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Line items
  const [items, setItems] = useState<BillItem[]>([]);

  // Product Search / Scanner state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Bill-level Discount
  const [billDiscountType, setBillDiscountType] = useState<'flat' | 'percent'>('flat');
  const [billDiscountValue, setBillDiscountValue] = useState<number>(0);

  // Payment State - defaults to UPI Scan & Pay with 0 paid so QR is generated for the exact bill total
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [autoFillPaid, setAutoFillPaid] = useState(false);

  // Split payment rows
  const [splitPayments, setSplitPayments] = useState<{ method: string; amount: number; reference: string }[]>([
    { method: 'cash', amount: 0, reference: '' },
    { method: 'upi', amount: 0, reference: '' }
  ]);

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load shop settings and Indian states list
  useEffect(() => {
    api.get('/shop').then(res => {
      setShop(res.data);
      if (res.data.state) {
        setPlaceOfSupply(res.data.state);
        setPlaceOfSupplyCode(res.data.state_code || '33');
      }
    });

    api.get('/shop/states').then(res => {
      setStates(res.data);
    });

    // Keyboard shortcut listener: F2 to focus product search, Esc to close dropdowns
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setShowProductDropdown(false);
        setShowCustomerDropdown(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Is Inter-state determined dynamically
  const isInterState = shop ? (placeOfSupplyCode !== shop.state_code) : false;

  // Search products
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get(`/billing/search-products?q=${encodeURIComponent(searchQuery)}`)
        .then(res => {
          setSearchResults(res.data);
          setShowProductDropdown(true);
        })
        .catch(console.error);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search customers by phone or name
  useEffect(() => {
    if (!customerQuery.trim()) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get(`/billing/search-customers?q=${encodeURIComponent(customerQuery)}`)
        .then(res => {
          setCustomerResults(res.data);
          setShowCustomerDropdown(true);
        })
        .catch(console.error);
    }, 200);
    return () => clearTimeout(timer);
  }, [customerQuery]);

  // Compute item numbers
  const computeItem = (item: BillItem, interState: boolean): BillItem => {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const raw_subtotal = Math.round(qty * rate * 100) / 100;

    let discount_amount = 0;
    if (item.discount_type === 'percent') {
      discount_amount = Math.round((raw_subtotal * (Number(item.discount_value) / 100)) * 100) / 100;
    } else {
      discount_amount = Math.min(raw_subtotal, Number(item.discount_value) || 0);
    }

    const net = Math.max(0, raw_subtotal - discount_amount);
    const taxRate = Number(item.gst_rate) || 0;

    let taxable_amount = 0;
    let total_tax = 0;
    let final_amount = 0;

    if (item.is_tax_inclusive) {
      final_amount = net;
      taxable_amount = Math.round((net / (1 + taxRate / 100)) * 100) / 100;
      total_tax = Math.round((final_amount - taxable_amount) * 100) / 100;
    } else {
      taxable_amount = net;
      total_tax = Math.round((taxable_amount * (taxRate / 100)) * 100) / 100;
      final_amount = Math.round((taxable_amount + total_tax) * 100) / 100;
    }

    let cgst_amount = 0;
    let sgst_amount = 0;
    let igst_amount = 0;

    if (interState) {
      igst_amount = total_tax;
    } else {
      cgst_amount = Math.round((total_tax / 2) * 100) / 100;
      sgst_amount = Math.round((total_tax - cgst_amount) * 100) / 100;
    }

    return {
      ...item,
      raw_subtotal,
      discount_amount,
      taxable_amount,
      cgst_amount,
      sgst_amount,
      igst_amount,
      total_tax,
      final_amount
    };
  };

  // Add product from search
  const addProductToBill = (p: Product) => {
    // Check if already in bill -> increment quantity
    const existingIdx = items.findIndex(i => i.product_id === p.id);
    if (existingIdx >= 0) {
      const updated = [...items];
      updated[existingIdx].quantity += 1;
      updated[existingIdx] = computeItem(updated[existingIdx], isInterState);
      setItems(updated);
    } else {
      const newItem: BillItem = computeItem({
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        hsn_code: p.hsn_code || '5208',
        category_name: p.category_name || '',
        unit: p.unit,
        quantity: 1,
        rate: p.selling_price,
        discount_type: 'flat',
        discount_value: 0,
        gst_rate: p.gst_rate,
        is_tax_inclusive: Boolean(p.is_tax_inclusive),
        raw_subtotal: 0,
        discount_amount: 0,
        taxable_amount: 0,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        total_tax: 0,
        final_amount: 0
      }, isInterState);
      setItems([...items, newItem]);
    }

    setSearchQuery('');
    setShowProductDropdown(false);
    searchInputRef.current?.focus();
  };

  // Add custom cloth line item
  const addBlankClothItem = () => {
    const newItem: BillItem = computeItem({
      product_name: 'Custom Fabric / Garment',
      sku: '',
      hsn_code: '5208',
      category_name: 'Textiles',
      unit: 'Pieces',
      quantity: 1,
      rate: 500,
      discount_type: 'flat',
      discount_value: 0,
      gst_rate: 5.0,
      is_tax_inclusive: false,
      raw_subtotal: 0,
      discount_amount: 0,
      taxable_amount: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      total_tax: 0,
      final_amount: 0
    }, isInterState);
    setItems([...items, newItem]);
  };

  // Update item field
  const updateItem = (index: number, fields: Partial<BillItem>) => {
    const updated = [...items];
    updated[index] = computeItem({
      ...updated[index],
      ...fields
    }, isInterState);
    setItems(updated);
  };

  // Remove item
  const removeItem = (index: number) => {
    const updated = items.filter((_, idx) => idx !== index);
    setItems(updated);
  };

  // Place of supply change updates all line taxes
  const handlePlaceOfSupplyChange = (code: string) => {
    setPlaceOfSupplyCode(code);
    const matched = states.find(s => s.code === code);
    if (matched) {
      setPlaceOfSupply(matched.name);
    }
  };

  // Recalculate all items when place of supply changes
  useEffect(() => {
    setItems(prevItems => prevItems.map(item => computeItem(item, isInterState)));
  }, [placeOfSupplyCode]);

  // Overall Invoice Financials
  let subtotalRaw = 0;
  let totalProductDiscount = 0;
  let totalTaxableAmount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalTaxAmount = 0;

  for (const item of items) {
    subtotalRaw += item.raw_subtotal;
    totalProductDiscount += item.discount_amount;
    totalTaxableAmount += item.taxable_amount;
    totalCgst += item.cgst_amount;
    totalSgst += item.sgst_amount;
    totalIgst += item.igst_amount;
    totalTaxAmount += item.total_tax;
  }

  let totalBillDiscount = 0;
  if (billDiscountType === 'percent') {
    totalBillDiscount = Math.round((totalTaxableAmount * (billDiscountValue / 100)) * 100) / 100;
  } else {
    totalBillDiscount = Math.min(totalTaxableAmount, Number(billDiscountValue) || 0);
  }

  const unroundedTotal = Math.max(0, totalTaxableAmount + totalTaxAmount - totalBillDiscount);
  const grandTotal = Math.round(unroundedTotal);
  const roundOff = Math.round((grandTotal - unroundedTotal) * 100) / 100;

  // Auto update amountPaid if in autoFill mode
  useEffect(() => {
    if (autoFillPaid) {
      setAmountPaid(grandTotal);
      if (paymentMethod === 'split') {
        const half = Math.floor(grandTotal / 2);
        setSplitPayments([
          { method: 'cash', amount: half, reference: '' },
          { method: 'upi', amount: grandTotal - half, reference: '' }
        ]);
      }
    }
  }, [grandTotal, autoFillPaid, paymentMethod]);

  const balanceDue = Math.max(0, Math.round((grandTotal - amountPaid) * 100) / 100);

  // Autofill existing customer selection
  const selectCustomer = (c: Customer) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone || '');
    setCustomerAddress(c.address || '');
    setCustomerGstin(c.gstin || '');
    if (c.state_code) {
      handlePlaceOfSupplyChange(c.state_code);
    }
    setShowCustomerDropdown(false);
    setCustomerQuery('');
  };

  // Submit Invoice to Backend
  const handleGenerateInvoice = async (printDirectly = true) => {
    if (items.length === 0) {
      setError('Please add at least one cloth item to the bill.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const payload = {
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        customer_gstin: customerGstin,
        place_of_supply: placeOfSupply,
        place_of_supply_code: placeOfSupplyCode,
        items: items.map(i => ({
          product_id: i.product_id,
          name: i.product_name,
          sku: i.sku,
          hsn_code: i.hsn_code,
          category_name: i.category_name,
          unit: i.unit,
          quantity: i.quantity,
          rate: i.rate,
          discount_type: i.discount_type,
          discount_value: i.discount_value,
          gst_rate: i.gst_rate,
          is_tax_inclusive: i.is_tax_inclusive
        })),
        bill_discount_type: billDiscountType,
        bill_discount_value: billDiscountValue,
        payment_method: paymentMethod,
        amount_paid: amountPaid,
        split_payments: paymentMethod === 'split' ? splitPayments : [],
        notes
      };

      const res = await api.post('/billing/create-invoice', payload);

      // Clear bill
      setItems([]);
      setCustomerName('Walk-in Customer');
      setCustomerPhone('');
      setCustomerAddress('');
      setCustomerGstin('');
      setBillDiscountValue(0);
      setPaymentMethod('upi');
      setAmountPaid(0);
      setAutoFillPaid(false);
      setNotes('');
      setError('');

      onInvoiceCreated(res.data, printDirectly);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create invoice. Please check entered values.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* HEADER BAR: Shop Info & State Status */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white uppercase font-serif tracking-wide">
              {shop?.shop_name || 'SRI LAKSHMI SILKS & TEXTILES'}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
              <span>GSTIN: <b className="text-slate-800 dark:text-slate-200">{shop?.gstin}</b></span>
              <span>Shop State: <b className="text-slate-800 dark:text-slate-200">{shop?.state} ({shop?.state_code})</b></span>
              <span>Next Prefix: <b className="font-mono text-indigo-600">{shop?.invoice_prefix}</b></span>
            </div>
          </div>
        </div>

        {/* GST Intra / Inter state indicator pill */}
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${isInterState
              ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800'
              : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800'
            }`}>
            {isInterState ? '● Inter-State (IGST 100%)' : '● Intra-State (CGST 50% + SGST 50%)'}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center gap-2.5 text-xs text-red-700 dark:text-red-400 font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* TWO COLUMN WORKSPACE: Left = Customer & Items | Right = Financial Summary & Payment */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* LEFT COLUMN: Customer & Products Table (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">

          {/* CUSTOMER ACCORDION / BAR */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-indigo-600" />
                Customer Details
              </span>

              {/* Fast customer phone search */}
              <div className="relative">
                <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-slate-50 dark:bg-slate-800 text-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                  <input
                    type="text"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    placeholder="Search returning customer..."
                    className="bg-transparent text-slate-900 dark:text-white focus:outline-none w-44"
                  />
                </div>

                {/* Dropdown matches */}
                {showCustomerDropdown && customerResults.length > 0 && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-40 max-h-48 overflow-y-auto">
                    {customerResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => selectCustomer(c)}
                        className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 text-xs"
                      >
                        <div className="font-bold text-slate-900 dark:text-white">{c.name}</div>
                        <div className="text-slate-500 font-mono">{c.phone} • Dues: ₹{c.outstanding_balance}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1 font-medium">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">Mobile Number</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">Place of Supply (State)</label>
                <select
                  value={placeOfSupplyCode}
                  onChange={(e) => handlePlaceOfSupplyChange(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                >
                  {states.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1 font-medium">Customer GSTIN (B2B)</label>
                <input
                  type="text"
                  value={customerGstin}
                  onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                  placeholder="Optional B2B GSTIN"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase"
                />
              </div>
            </div>
          </div>

          {/* PRODUCT SEARCH & ADD BAR */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">

              {/* Fast Search input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search cloth name, scan barcode, or enter SKU (Press F2)..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />

                {/* Autocomplete Results Dropdown */}
                {showProductDropdown && searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-40 max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => addProductToBill(p)}
                        className="p-3 hover:bg-indigo-50 dark:hover:bg-slate-700/80 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white text-sm">
                            {p.name}
                          </div>
                          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-mono mt-0.5">
                            <span>SKU: {p.sku}</span>
                            <span>HSN: {p.hsn_code}</span>
                            <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 font-bold">
                              Stock: {p.stock_quantity} {p.unit}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400">
                            ₹{p.selling_price}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {p.is_tax_inclusive ? 'Tax Inclusive' : `+${p.gst_rate}% GST`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Custom Blank Line Item Button */}
              <button
                type="button"
                onClick={addBlankClothItem}
                className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Custom Cloth Line
              </button>

            </div>
          </div>

          {/* INVOICE ITEMS TABLE */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Bill Products ({items.length} items)
              </span>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setItems([])}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear All Items
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No items added to invoice yet</p>
                <p className="text-xs text-slate-400 mt-1">Scan barcode, search cloth above, or press F2 to begin.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                      <th className="py-2 px-2 w-6 text-center">#</th>
                      <th className="py-2 px-2 min-w-[160px]">Cloth Description</th>
                      <th className="py-2 px-2 w-20">HSN</th>
                      <th className="py-2 px-2 w-20 text-center">Unit</th>
                      <th className="py-2 px-2 w-16 text-right">Qty</th>
                      <th className="py-2 px-2 w-20 text-right">Rate (₹)</th>
                      <th className="py-2 px-2 w-20 text-right">Disc (₹)</th>
                      <th className="py-2 px-2 w-16 text-center">GST%</th>
                      <th className="py-2 px-2 w-24 text-right">Final (₹)</th>
                      <th className="py-2 px-2 w-8 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-2 text-center text-slate-400 font-mono">{idx + 1}</td>

                        {/* Name & SKU */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={item.product_name}
                            onChange={(e) => updateItem(idx, { product_name: e.target.value })}
                            className="w-full font-semibold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none"
                          />
                          {item.sku && (
                            <span className="text-[10px] text-slate-400 font-mono block">SKU: {item.sku}</span>
                          )}
                        </td>

                        {/* HSN */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={item.hsn_code}
                            onChange={(e) => updateItem(idx, { hsn_code: e.target.value })}
                            className="w-16 font-mono text-slate-700 dark:text-slate-300 bg-transparent border-b border-transparent hover:border-slate-300 focus:outline-none"
                          />
                        </td>

                        {/* Unit */}
                        <td className="py-2 px-2 text-center">
                          <select
                            value={item.unit}
                            onChange={(e) => updateItem(idx, { unit: e.target.value as TextileUnit })}
                            className="bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-[11px] font-medium text-slate-800 dark:text-slate-200"
                          >
                            {TEXTILE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>

                        {/* Quantity */}
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                            className="w-14 text-right font-bold text-slate-950 dark:text-white border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 bg-white dark:bg-slate-800"
                          />
                        </td>

                        {/* Rate */}
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.rate}
                            onChange={(e) => updateItem(idx, { rate: parseFloat(e.target.value) || 0 })}
                            className="w-16 text-right font-mono font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 bg-white dark:bg-slate-800"
                          />
                        </td>

                        {/* Discount */}
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.discount_value}
                            onChange={(e) => updateItem(idx, { discount_value: parseFloat(e.target.value) || 0 })}
                            className="w-14 text-right font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 bg-white dark:bg-slate-800"
                          />
                        </td>

                        {/* GST % */}
                        <td className="py-2 px-2 text-center">
                          <select
                            value={item.gst_rate}
                            onChange={(e) => updateItem(idx, { gst_rate: parseFloat(e.target.value) })}
                            className="bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 text-[11px] font-mono text-slate-800 dark:text-slate-200"
                          >
                            {GST_SLABS.map(s => <option key={s} value={s}>{s}%</option>)}
                          </select>
                        </td>

                        {/* Final Amount */}
                        <td className="py-2 px-2 text-right font-mono font-black text-slate-950 dark:text-white">
                          ₹{item.final_amount.toFixed(2)}
                        </td>

                        {/* Remove button */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Financial Summary & Payment Engine (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">

          {/* TOTALS SUMMARY CARD */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3 text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider pb-2 border-b border-slate-200 dark:border-slate-800">
              Bill Summary
            </h3>

            <div className="space-y-1.5">
              <div className="flex justify-between text-slate-500">
                <span>Gross Subtotal:</span>
                <span className="font-mono text-slate-900 dark:text-white font-medium">₹{subtotalRaw.toFixed(2)}</span>
              </div>

              {totalProductDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Product Discounts:</span>
                  <span className="font-mono">-₹{totalProductDiscount.toFixed(2)}</span>
                </div>
              )}

              {/* Bill Discount Input */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-slate-600 dark:text-slate-300">Bill Discount:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={billDiscountValue}
                    onChange={(e) => setBillDiscountValue(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-16 px-1.5 py-0.5 text-right font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <select
                    value={billDiscountType}
                    onChange={(e) => setBillDiscountType(e.target.value as any)}
                    className="border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="flat">₹</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-between text-slate-700 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="font-semibold">Taxable Value:</span>
                <span className="font-mono font-semibold">₹{totalTaxableAmount.toFixed(2)}</span>
              </div>

              {/* GST Split */}
              {!isInterState ? (
                <>
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>CGST:</span>
                    <span className="font-mono">₹{totalCgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-[11px]">
                    <span>SGST:</span>
                    <span className="font-mono">₹{totalSgst.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                  <span>IGST (Inter-State):</span>
                  <span className="font-mono">₹{totalIgst.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Total Tax Amount:</span>
                <span className="font-mono font-medium">₹{totalTaxAmount.toFixed(2)}</span>
              </div>

              {roundOff !== 0 && (
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Round Off:</span>
                  <span className="font-mono">{roundOff > 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}</span>
                </div>
              )}
            </div>

            {/* GRAND TOTAL PROMINENT DISPLAY */}
            <div className="p-3 bg-linear-to-br from-indigo-900 to-slate-900 text-white rounded-xl shadow-md">
              <span className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 block">
                NET PAYABLE AMOUNT
              </span>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight mt-0.5">
                ₹{grandTotal.toLocaleString('en-IN')}
              </div>
            </div>

            {/* PAYMENT MODE SELECTION */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <label className="block text-slate-600 dark:text-slate-400 font-semibold text-xs">
                Payment Method &amp; QR Settings
              </label>

              {/* Fast Payment Mode Shortcuts */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('upi');
                    setAutoFillPaid(false);
                    setAmountPaid(0);
                  }}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${paymentMethod === 'upi' && amountPaid === 0
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                    }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  <span>⚡ Scan &amp; Pay (UPI QR)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('cash');
                    setAutoFillPaid(true);
                    setAmountPaid(grandTotal);
                  }}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${paymentMethod === 'cash' && amountPaid >= grandTotal
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                    }`}
                >
                  <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                  <span>💵 Cash Received</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {(['upi', 'cash', 'card', 'bank_transfer', 'credit', 'split'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(m);
                      if (m === 'upi') {
                        setAutoFillPaid(false);
                        setAmountPaid(0);
                      } else if (m === 'split') {
                        // Split payments handled separately
                      } else {
                        setAutoFillPaid(true);
                        setAmountPaid(grandTotal);
                      }
                    }}
                    className={`py-1.5 px-2 rounded-lg font-bold text-xs uppercase transition-all ${paymentMethod === m
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                  >
                    {m === 'upi' ? '⚡ UPI QR' : m.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Split Payment Inputs */}
              {paymentMethod === 'split' ? (
                <div className="space-y-2 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <div className="font-bold text-slate-700 dark:text-slate-300">
                    Split Payment Breakdown:
                  </div>
                  {splitPayments.map((sp, sIdx) => (
                    <div key={sIdx} className="flex items-center gap-2">
                      <select
                        value={sp.method}
                        onChange={(e) => {
                          const updated = [...splitPayments];
                          updated[sIdx].method = e.target.value;
                          setSplitPayments(updated);
                        }}
                        className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 uppercase font-medium text-[11px]"
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        <option value="bank_transfer">Bank</option>
                      </select>

                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={sp.amount}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = [...splitPayments];
                          updated[sIdx].amount = val;
                          setSplitPayments(updated);
                          const totalPaidFromSplit = updated.reduce((s, row) => s + row.amount, 0);
                          setAmountPaid(totalPaidFromSplit);
                        }}
                        className="w-24 px-2 py-1 text-right font-mono font-bold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                        placeholder="Amount"
                      />

                      <input
                        type="text"
                        value={sp.reference}
                        onChange={(e) => {
                          const updated = [...splitPayments];
                          updated[sIdx].reference = e.target.value;
                          setSplitPayments(updated);
                        }}
                        placeholder="Ref (optional)"
                        className="flex-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-center text-slate-500 mb-1">
                    <span>Amount Paid by Customer:</span>
                    <button
                      type="button"
                      onClick={() => setAmountPaid(grandTotal)}
                      className="text-[11px] font-bold text-indigo-600 hover:underline"
                    >
                      Exact (₹{grandTotal})
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amountPaid}
                    onChange={(e) => {
                      setAutoFillPaid(false);
                      setAmountPaid(parseFloat(e.target.value) || 0);
                    }}
                    className="w-full px-3 py-2 text-right font-mono font-bold text-base rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              {/* Balance Due Notification */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold">
                <span className={balanceDue > 0 ? 'text-red-600' : 'text-slate-600 dark:text-slate-400'}>
                  Balance Due:
                </span>
                <span className={`font-mono font-bold ${balanceDue > 0 ? 'text-red-600 text-sm' : 'text-emerald-600'}`}>
                  ₹{balanceDue.toFixed(2)}
                </span>
              </div>

              {/* QR Indicator */}
              <div className="p-2 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300 font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Payment QR Code</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                  Included on Bill
                </span>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={submitting || items.length === 0}
                onClick={() => handleGenerateInvoice(true)}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black rounded-xl text-sm transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                {submitting ? 'Generating...' : `Print Thermal Bill (${shop?.thermal_paper_width || '80mm'}) [F4]`}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={submitting || items.length === 0}
                  onClick={() => handleGenerateInvoice(false)}
                  className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Print Preview
                </button>

                <button
                  type="button"
                  disabled={submitting || items.length === 0}
                  onClick={() => handleGenerateInvoice(false)}
                  className="py-2.5 px-3 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 text-white dark:text-slate-900 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Save Only
                </button>
              </div>

              <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                <span>Roll: <b>{shop?.thermal_paper_width || '80mm'} Roll</b></span>
                <span>QR: <b>{shop?.qr_mode === 'static' ? 'Static' : '⚡ Dynamic Amount'}</b></span>
              </div>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};

