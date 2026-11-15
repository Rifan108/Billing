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
  Sparkles,
  X,
  CornerDownLeft,
  Package,
  Tag,
  CheckCircle2,
  Barcode
} from 'lucide-react';
import api, { generateIdempotencyKey } from '../services/api';
import { Product, Customer, ShopSettings, TextileUnit, PaymentMethod, Invoice, Category } from '../types';

interface BillingPageProps {
  onInvoiceCreated: (inv: Invoice, autoPrint?: boolean) => void;
}

interface BillItem {
  product_id?: number;
  variant_id?: number;
  variant_name?: string;
  barcode?: string;
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

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);

  // Product Search / Scanner state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(-1);

  // Staged Product for fast quantity entry
  interface StagedProductState {
    product: Product;
    quantity: number;
    rate: number;
    discount_value: number;
  }
  const [stagedProduct, setStagedProduct] = useState<StagedProductState | null>(null);

  // Quick Add Product Modal state
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddSku, setQuickAddSku] = useState('');
  const [quickAddCategoryId, setQuickAddCategoryId] = useState<number | ''>('');
  const [quickAddHsn, setQuickAddHsn] = useState('5208');
  const [quickAddUnit, setQuickAddUnit] = useState<TextileUnit>('Pieces');
  const [quickAddSellingPrice, setQuickAddSellingPrice] = useState<number | ''>('');
  const [quickAddPurchasePrice, setQuickAddPurchasePrice] = useState<number | ''>('');
  const [quickAddGstRate, setQuickAddGstRate] = useState<number>(5);
  const [quickAddStock, setQuickAddStock] = useState<number>(10);
  const [quickAddError, setQuickAddError] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);

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

  // Barcode Scanner Integration
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);
  const [scanToast, setScanToast] = useState<{ name: string; variant?: string; rate: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const stagedQtyInputRef = useRef<HTMLInputElement>(null);
  const quickAddPriceInputRef = useRef<HTMLInputElement>(null);

  // Audio beep feedback for barcode scanner (High-tone beep on success, low buzzer on error)
  const playScannerBeep = (success = true) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      if (success) {
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 tone
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);
      } else {
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (_) { }
  };

  // Load shop settings, Indian states list, and Categories
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

    api.get('/products/categories').then(res => {
      setCategories(res.data);
    }).catch(console.error);

    // Keyboard shortcut listener: F2 to focus product search, F3 to focus barcode scanner, Esc to close dropdowns / cancel staging
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setStagedProduct(null);
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F3') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      } else if (e.key === 'Escape') {
        setShowProductDropdown(false);
        setShowCustomerDropdown(false);
        if (stagedProduct) {
          setStagedProduct(null);
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stagedProduct]);

  // Click outside to dismiss product dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Is Inter-state determined dynamically
  const isInterState = shop ? (placeOfSupplyCode !== shop.state_code) : false;

  // Search products with debounce & auto-selection of first item
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowProductDropdown(false);
      setSelectedSearchIndex(-1);
      setIsSearchingProduct(false);
      return;
    }
    setIsSearchingProduct(true);
    const timer = setTimeout(() => {
      api.get(`/billing/search-products?q=${encodeURIComponent(searchQuery)}`)
        .then(res => {
          setSearchResults(res.data);
          setShowProductDropdown(true);
          setSelectedSearchIndex(res.data.length > 0 ? 0 : -1);
        })
        .catch(console.error)
        .finally(() => {
          setIsSearchingProduct(false);
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Scroll active dropdown item into view
  useEffect(() => {
    if (selectedSearchIndex >= 0 && searchResults.length > 0) {
      const el = document.getElementById(`search-result-item-${selectedSearchIndex}`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedSearchIndex, searchResults]);

  // Auto-focus and select quantity when stagedProduct is opened
  useEffect(() => {
    if (stagedProduct) {
      const t = setTimeout(() => {
        stagedQtyInputRef.current?.focus();
        stagedQtyInputRef.current?.select();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [stagedProduct]);

  // Auto-generate textile SKU
  const generateSku = (prodName: string) => {
    const clean = prodName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'TXT';
    const rand = Math.floor(100 + Math.random() * 900);
    return `${clean}-${rand}`;
  };

  // Open Quick Add Modal
  const openQuickAddModal = (name: string = '') => {
    const trimmedName = name.trim();
    setQuickAddName(trimmedName);
    setQuickAddSku(generateSku(trimmedName));
    const defaultCat = categories.length > 0 ? categories[0] : null;
    setQuickAddCategoryId(defaultCat ? defaultCat.id : '');
    setQuickAddHsn(defaultCat?.hsn_default || '5208');
    setQuickAddUnit('Pieces');
    setQuickAddSellingPrice('');
    setQuickAddPurchasePrice('');
    setQuickAddGstRate(defaultCat?.gst_default || 5);
    setQuickAddStock(10);
    setQuickAddError('');
    setShowProductDropdown(false);
    setShowQuickAddModal(true);
    setTimeout(() => {
      quickAddPriceInputRef.current?.focus();
    }, 120);
  };

  // Handle Quick Add Submit
  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddName.trim()) {
      setQuickAddError('Product name is required');
      return;
    }
    if (!quickAddSku.trim()) {
      setQuickAddError('Product code / SKU is required');
      return;
    }
    if (quickAddSellingPrice === '' || Number(quickAddSellingPrice) < 0) {
      setQuickAddError('Please enter a valid selling price');
      quickAddPriceInputRef.current?.focus();
      return;
    }

    setQuickAddSaving(true);
    setQuickAddError('');

    try {
      const payload = {
        name: quickAddName.trim(),
        sku: quickAddSku.trim().toUpperCase(),
        category_id: quickAddCategoryId || null,
        hsn_code: quickAddHsn.trim() || '5208',
        unit: quickAddUnit,
        purchase_price: Number(quickAddPurchasePrice) || 0,
        selling_price: Number(quickAddSellingPrice) || 0,
        is_tax_inclusive: false,
        gst_rate: Number(quickAddGstRate) || 5.0,
        stock_quantity: Number(quickAddStock) || 0,
        min_stock_alert: 5,
        supplier: 'Direct Billing Quick-Add',
        description: `Created directly during billing on ${new Date().toLocaleDateString()}`
      };

      const res = await api.post('/products', payload);
      const createdProduct: Product = res.data;

      // Close modal
      setShowQuickAddModal(false);

      // Automatically add newly created product to the current bill
      addProductToBill(createdProduct, 1);
      setSearchQuery('');
    } catch (err: any) {
      setQuickAddError(err.response?.data?.error || 'Failed to create product. Please verify fields.');
    } finally {
      setQuickAddSaving(false);
    }
  };

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

  // Stage product for quantity entry
  const stageProduct = (p: Product) => {
    setStagedProduct({
      product: p,
      quantity: 1,
      rate: p.selling_price,
      discount_value: 0
    });
    setSearchQuery('');
    setShowProductDropdown(false);
    setSelectedSearchIndex(-1);
  };

  // Add product to bill (from staged bar, barcode scanner, or direct 1-click)
  const addProductToBill = (p: Product, customQty: number = 1, customRate?: number, customDiscount: number = 0) => {
    const qtyToAdd = Number(customQty) > 0 ? Number(customQty) : 1;
    const rateToUse = customRate !== undefined && customRate >= 0 ? customRate : p.selling_price;

    const existingIdx = items.findIndex(i => {
      if (p.variant_id) {
        return i.variant_id === p.variant_id;
      }
      return i.product_id === p.id && !i.variant_id;
    });

    if (existingIdx >= 0) {
      const updated = [...items];
      updated[existingIdx].quantity += qtyToAdd;
      if (customRate !== undefined) updated[existingIdx].rate = rateToUse;
      if (customDiscount > 0) updated[existingIdx].discount_value = customDiscount;
      updated[existingIdx] = computeItem(updated[existingIdx], isInterState);
      setItems(updated);
    } else {
      const newItem: BillItem = computeItem({
        product_id: p.id,
        variant_id: p.variant_id,
        variant_name: p.variant_name,
        barcode: p.barcode,
        product_name: p.name,
        sku: p.sku,
        hsn_code: p.hsn_code || '5208',
        category_name: p.category_name || p.category_display_name || '',
        unit: p.unit,
        quantity: qtyToAdd,
        rate: rateToUse,
        discount_type: 'flat',
        discount_value: customDiscount || 0,
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
    setSelectedSearchIndex(-1);
    setStagedProduct(null);
  };

  // Dedicated Barcode Scanner input handler
  const handleBarcodeSubmit = async (codeToScan?: string) => {
    const code = (codeToScan || barcodeInput).trim();
    if (!code) return;
    setIsScanningBarcode(true);
    try {
      const res = await api.get(`/billing/barcode-scan?barcode=${encodeURIComponent(code)}`);
      if (res.data?.success && res.data?.product) {
        const prod = res.data.product;
        playScannerBeep(true);
        addProductToBill(prod, 1);
        setScanToast({
          name: prod.name,
          variant: prod.variant_name,
          rate: prod.selling_price
        });
        setTimeout(() => setScanToast(null), 3000);
        setBarcodeInput('');
        setError('');
        // Keep focus on barcode scanner for rapid multi-item scanning
        setTimeout(() => barcodeInputRef.current?.focus(), 40);
      }
    } catch (err: any) {
      playScannerBeep(false);
      const msg = err.response?.data?.error || `Barcode "${code}" not found in inventory.`;
      setError(msg);
      barcodeInputRef.current?.select();
    } finally {
      setIsScanningBarcode(false);
    }
  };

  // Confirm staged product addition
  const handleStagedConfirm = () => {
    if (!stagedProduct) return;
    const qty = Number(stagedProduct.quantity);
    if (qty <= 0 || isNaN(qty)) {
      alert('Please enter a valid quantity greater than 0');
      stagedQtyInputRef.current?.focus();
      return;
    }
    addProductToBill(stagedProduct.product, qty, stagedProduct.rate, stagedProduct.discount_value);
  };

  // Keyboard navigation inside search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setShowProductDropdown(true);
        setSelectedSearchIndex(prev => (prev + 1) % searchResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchResults.length > 0) {
        setShowProductDropdown(true);
        setSelectedSearchIndex(prev => (prev <= 0 ? searchResults.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showProductDropdown && selectedSearchIndex >= 0 && searchResults[selectedSearchIndex]) {
        stageProduct(searchResults[selectedSearchIndex]);
      } else if (searchResults.length === 1) {
        stageProduct(searchResults[0]);
      } else if (searchResults.length === 0 && searchQuery.trim().length > 0) {
        // Check if entered query is a barcode
        api.get(`/billing/barcode-scan?barcode=${encodeURIComponent(searchQuery.trim())}`)
          .then(res => {
            if (res.data?.success && res.data?.product) {
              const prod = res.data.product;
              playScannerBeep(true);
              addProductToBill(prod, 1);
              setScanToast({
                name: prod.name,
                variant: prod.variant_name,
                rate: prod.selling_price
              });
              setTimeout(() => setScanToast(null), 3000);
              setSearchQuery('');
            } else {
              openQuickAddModal(searchQuery.trim());
            }
          })
          .catch(() => {
            openQuickAddModal(searchQuery.trim());
          });
      }
    } else if (e.key === 'Escape') {
      setShowProductDropdown(false);
      setSelectedSearchIndex(-1);
    }
  };

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
    if (submitting) return; // Strict double-click prevention
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
          variant_id: i.variant_id,
          variant_name: i.variant_name,
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

      const res = await api.post('/billing/create-invoice', payload, {
        headers: {
          'Idempotency-Key': generateIdempotencyKey()
        }
      });

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
          <div ref={searchContainerRef} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
            {/* Header / Shortcut Hints */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Product Search & Barcode Scanner
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">F2 Search</span>
                <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800 font-bold">F3 Barcode</span>
                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">↑↓ Navigate</span>
                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">↵ Select</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-stretch">
              {/* Fast Search input (7 cols on desktop) */}
              <div className="relative md:col-span-7">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Type product name (e.g. Silk Saree, Cotton, Shirt), SKU..."
                  className="w-full pl-10 pr-20 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />

                {/* Right controls: clear button & spinner */}
                <div className="absolute right-3 top-2.5 flex items-center gap-1.5">
                  {isSearchingProduct && (
                    <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  )}
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setShowProductDropdown(false);
                        setSelectedSearchIndex(-1);
                        searchInputRef.current?.focus();
                      }}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono font-semibold">
                    F2
                  </span>
                </div>

                {/* Autocomplete Results Dropdown */}
                {showProductDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-40 max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                    {searchResults.length > 0 ? (
                      searchResults.map((p, idx) => {
                        const isSelected = selectedSearchIndex === idx;
                        const isLowStock = p.stock_quantity > 0 && p.stock_quantity <= p.min_stock_alert;
                        const isOutOfStock = p.stock_quantity <= 0;

                        return (
                          <div
                            id={`search-result-item-${idx}`}
                            key={`${p.id}-${p.variant_id || 0}`}
                            onClick={() => stageProduct(p)}
                            onMouseEnter={() => setSelectedSearchIndex(idx)}
                            className={`p-3 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-950/70 border-l-4 border-indigo-600'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                          >
                            <div className="space-y-1 flex-1 min-w-0 pr-4">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 dark:text-white text-sm">
                                  {p.name}
                                </span>
                                {p.is_variant && p.variant_name && (
                                  <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold px-2 py-0.5 rounded text-[10px] border border-indigo-200 dark:border-indigo-700">
                                    Variant: {p.variant_name}
                                  </span>
                                )}
                                {(p.category_name || p.category_display_name) && (
                                  <span className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                                    {p.category_name || p.category_display_name}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-slate-500 text-[11px] font-mono flex-wrap">
                                <span>SKU: <strong className="text-slate-700 dark:text-slate-300">{p.sku}</strong></span>
                                {p.barcode && <span>• Barcode: <strong className="text-slate-700 dark:text-slate-300">{p.barcode}</strong></span>}
                                {p.hsn_code && <span>• HSN: {p.hsn_code}</span>}
                                <span
                                  className={`px-1.5 py-0.5 rounded font-bold ${
                                    isOutOfStock
                                      ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400'
                                      : isLowStock
                                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                                      : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  Stock: {p.stock_quantity} {p.unit}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400">
                                  ₹{p.selling_price.toLocaleString('en-IN')}
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  {p.is_tax_inclusive ? 'Tax Inclusive' : `+${p.gst_rate}% GST`}
                                </span>
                              </div>

                              <button
                                type="button"
                                title="Quick Add 1 Unit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addProductToBill(p, 1);
                                }}
                                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 active:scale-95"
                              >
                                <Plus className="w-3 h-3" />
                                Add 1
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      // Product Not Found
                      <div className="p-4 text-center space-y-3">
                        <div className="inline-flex p-2 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                          <AlertCircle className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white text-sm">
                            Product not found
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            No textile product matches "<span className="font-semibold text-slate-800 dark:text-slate-200">{searchQuery}</span>"
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openQuickAddModal(searchQuery)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 mx-auto shadow-md shadow-indigo-600/20 active:scale-95 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Quick Add "{searchQuery}" to Products (↵ Enter)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Dedicated Barcode Scanner input (5 cols on desktop) */}
              <div className="relative md:col-span-5 flex items-center gap-2">
                <div className="relative flex-1">
                  <Barcode className="w-4 h-4 text-emerald-600 dark:text-emerald-400 absolute left-3.5 top-3" />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBarcodeSubmit();
                      }
                    }}
                    placeholder="Scan Barcode (USB / Keyboard)..."
                    className="w-full pl-10 pr-16 py-2.5 rounded-xl border-2 border-emerald-500/70 dark:border-emerald-500/60 bg-emerald-50/30 dark:bg-emerald-950/20 text-slate-900 dark:text-white text-xs sm:text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all placeholder:font-sans placeholder:font-normal placeholder:text-slate-400"
                  />
                  <div className="absolute right-2.5 top-2.5 flex items-center gap-1">
                    {isScanningBarcode && (
                      <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    )}
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 px-1.5 py-0.5 rounded font-mono font-bold">
                      F3
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addBlankClothItem}
                  className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer shrink-0"
                  title="Add blank custom cloth line"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Custom</span>
                </button>
              </div>

            </div>

            {/* Instant Scanned Item Toast Banner */}
            {scanToast && (
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Scanned & Added: <strong>{scanToast.name}</strong> {scanToast.variant && <span className="text-emerald-700 dark:text-emerald-400 font-semibold">({scanToast.variant})</span>}
                  </span>
                </div>
                <div className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                  ₹{scanToast.rate.toFixed(2)}
                </div>
              </div>
            )}

            {/* STAGED PRODUCT ENTRY BAR (Instant Quantity & Rate Input) */}
            {stagedProduct && (
              <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border-2 border-indigo-500 dark:border-indigo-500/80 rounded-xl p-3.5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150 shadow-md shadow-indigo-500/10">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white">
                      Selected Item
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base">
                      {stagedProduct.product.name}
                    </span>
                    {stagedProduct.product.is_variant && stagedProduct.product.variant_name && (
                      <span className="bg-indigo-600 text-white font-bold px-2 py-0.5 rounded text-xs">
                        {stagedProduct.product.variant_name}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStagedProduct(null);
                      searchInputRef.current?.focus();
                    }}
                    className="p-1 hover:bg-indigo-200/50 dark:hover:bg-indigo-900/50 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-medium flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel (Esc)</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
                  {/* SKU & Category Info */}
                  <div>
                    <label className="block text-[11px] text-slate-500 font-semibold mb-1">Product Code / SKU</label>
                    <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                      {stagedProduct.product.sku}
                    </div>
                  </div>

                  {/* Available Stock */}
                  <div>
                    <label className="block text-[11px] text-slate-500 font-semibold mb-1">Available Stock</label>
                    <div className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold ${
                      stagedProduct.product.stock_quantity <= 0
                        ? 'bg-red-50 dark:bg-red-950/50 border-red-200 text-red-700 dark:text-red-300'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 font-mono'
                    }`}>
                      {stagedProduct.product.stock_quantity} {stagedProduct.product.unit}
                    </div>
                  </div>

                  {/* Selling Rate (₹) */}
                  <div>
                    <label className="block text-[11px] text-slate-500 font-semibold mb-1">
                      Selling Price (₹/{stagedProduct.product.unit})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={stagedProduct.rate}
                      onChange={(e) => setStagedProduct({ ...stagedProduct, rate: parseFloat(e.target.value) || 0 })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleStagedConfirm();
                        else if (e.key === 'Escape') {
                          setStagedProduct(null);
                          searchInputRef.current?.focus();
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Quantity to Add */}
                  <div>
                    <label className="block text-[11px] text-indigo-700 dark:text-indigo-300 font-black mb-1">
                      Quantity ({stagedProduct.product.unit}) *
                    </label>
                    <input
                      ref={stagedQtyInputRef}
                      type="number"
                      min="0.01"
                      step="any"
                      value={stagedProduct.quantity}
                      onChange={(e) => setStagedProduct({ ...stagedProduct, quantity: parseFloat(e.target.value) || 0 })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleStagedConfirm();
                        else if (e.key === 'Escape') {
                          setStagedProduct(null);
                          searchInputRef.current?.focus();
                        }
                      }}
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border-2 border-indigo-600 text-slate-950 dark:text-white text-sm font-black text-right focus:outline-none shadow-sm"
                    />
                  </div>

                  {/* Line Total Preview */}
                  <div>
                    <label className="block text-[11px] text-slate-500 font-semibold mb-1">Line Amount</label>
                    <div className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right text-xs font-mono font-black text-slate-900 dark:text-white">
                      ₹{Math.round((stagedProduct.quantity * stagedProduct.rate * (stagedProduct.product.is_tax_inclusive ? 1 : (1 + stagedProduct.product.gst_rate / 100))) * 100) / 100}
                    </div>
                  </div>

                  {/* Confirm Button */}
                  <div>
                    <button
                      type="button"
                      onClick={handleStagedConfirm}
                      className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg text-xs transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Check className="w-4 h-4" />
                      Add to Bill (↵)
                    </button>
                  </div>
                </div>
              </div>
            )}
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

                        {/* Name & SKU & Variant */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            value={item.product_name}
                            onChange={(e) => updateItem(idx, { product_name: e.target.value })}
                            className="w-full font-semibold text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none"
                          />
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            {item.variant_name && (
                              <span className="text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold px-1.5 py-0.2 rounded border border-indigo-200 dark:border-indigo-800">
                                {item.variant_name}
                              </span>
                            )}
                            {item.sku && (
                              <span className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</span>
                            )}
                          </div>
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
                            min="0.01"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                searchInputRef.current?.focus();
                              }
                            }}
                            className="w-16 text-right font-bold text-slate-950 dark:text-white border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 focus:ring-1 focus:ring-indigo-500"
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
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                searchInputRef.current?.focus();
                              }
                            }}
                            className="w-18 text-right font-mono font-medium text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 focus:ring-1 focus:ring-indigo-500"
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
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                searchInputRef.current?.focus();
                              }
                            }}
                            className="w-14 text-right font-mono text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 bg-white dark:bg-slate-800 focus:ring-1 focus:ring-indigo-500"
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

      {/* QUICK ADD PRODUCT MODAL (Product Not Found) */}
      {showQuickAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">Quick Add Product to Inventory</h3>
                  <p className="text-[11px] text-indigo-100">Saves to database and automatically adds to current bill</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                className="p-1 hover:bg-indigo-700 rounded-lg text-indigo-100 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleQuickAddSubmit} className="p-5 space-y-4 text-xs">
              {quickAddError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{quickAddError}</span>
                </div>
              )}

              <div className="space-y-3">
                {/* Product Name */}
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Product / Cloth Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={quickAddName}
                    onChange={(e) => setQuickAddName(e.target.value)}
                    placeholder="e.g. Linen Cotton Shirt, Pure Silk Saree..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Category */}
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      Category
                    </label>
                    <select
                      value={quickAddCategoryId}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : '';
                        setQuickAddCategoryId(val);
                        const matchedCat = categories.find(c => c.id === val);
                        if (matchedCat) {
                          if (matchedCat.hsn_default) setQuickAddHsn(matchedCat.hsn_default);
                          if (matchedCat.gst_default) setQuickAddGstRate(matchedCat.gst_default);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">-- Select Category --</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* SKU */}
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      Product Code / SKU *
                    </label>
                    <input
                      type="text"
                      required
                      value={quickAddSku}
                      onChange={(e) => setQuickAddSku(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Unit */}
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      Unit of Measure *
                    </label>
                    <select
                      value={quickAddUnit}
                      onChange={(e) => setQuickAddUnit(e.target.value as TextileUnit)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      {TEXTILE_UNITS.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>

                  {/* HSN Code */}
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      HSN Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={quickAddHsn}
                      onChange={(e) => setQuickAddHsn(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* GST Rate */}
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      GST Rate *
                    </label>
                    <select
                      value={quickAddGstRate}
                      onChange={(e) => setQuickAddGstRate(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      {GST_SLABS.map(s => (
                        <option key={s} value={s}>{s}% GST</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Selling Price */}
                  <div>
                    <label className="block text-indigo-700 dark:text-indigo-400 font-extrabold mb-1">
                      Selling Price (₹) *
                    </label>
                    <input
                      ref={quickAddPriceInputRef}
                      type="number"
                      required
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={quickAddSellingPrice}
                      onChange={(e) => setQuickAddSellingPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border-2 border-indigo-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-black text-sm focus:outline-none"
                    />
                  </div>

                  {/* Purchase Price */}
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      Cost / Purchase (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      value={quickAddPurchasePrice}
                      onChange={(e) => setQuickAddPurchasePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Initial Stock */}
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                      Initial Stock Qty *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={quickAddStock}
                      onChange={(e) => setQuickAddStock(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowQuickAddModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  Cancel (Esc)
                </button>

                <button
                  type="submit"
                  disabled={quickAddSaving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-black shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  {quickAddSaving ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save & Add to Bill (↵)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

