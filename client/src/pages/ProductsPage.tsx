import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  History,
  Edit2,
  Trash2,
  ArrowUpDown,
  Tag,
  CheckCircle2,
  Boxes,
  Barcode,
  Layers
} from 'lucide-react';
import api from '../services/api';
import { Product, Category, TextileUnit } from '../types';
import { useAuth } from '../context/AuthContext';

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

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [stockStatus, setStockStatus] = useState<string>(''); // '', 'low_stock', 'out_of_stock'

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  // Stock Adjustment Modal
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustType, setAdjustType] = useState<'stock_in' | 'stock_out' | 'adjustment'>('stock_in');
  const [adjustQuantity, setAdjustQuantity] = useState<number>(10);
  const [adjustReason, setAdjustReason] = useState('');

  // Stock History Drawer / Modal
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Category Management Modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatHsn, setNewCatHsn] = useState('5208');
  const [newCatGst, setNewCatGst] = useState<number>(5.0);

  // Product Form State (for both Add and Edit)
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    category_id: '',
    hsn_code: '5208',
    unit: 'Pieces' as TextileUnit,
    purchase_price: 0,
    selling_price: 0,
    is_tax_inclusive: false,
    gst_rate: 5.0,
    stock_quantity: 0,
    min_stock_alert: 5.0,
    supplier: '',
    description: ''
  });

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { isAdmin } = useAuth();

  const fetchCategories = async () => {
    try {
      const res = await api.get('/products/categories');
      setCategories(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (selectedCategory) params.append('category_id', selectedCategory);
      if (stockStatus) params.append('stock_status', stockStatus);

      const res = await api.get(`/products?${params.toString()}`);
      setProducts(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchProducts();
  }, [selectedCategory, stockStatus]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Open Edit Product
  const handleOpenEdit = (p: Product) => {
    setEditProduct(p);
    setFormData({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode || '',
      category_id: p.category_id ? String(p.category_id) : '',
      hsn_code: p.hsn_code,
      unit: p.unit,
      purchase_price: p.purchase_price,
      selling_price: p.selling_price,
      is_tax_inclusive: Boolean(p.is_tax_inclusive),
      gst_rate: p.gst_rate,
      stock_quantity: p.stock_quantity,
      min_stock_alert: p.min_stock_alert,
      supplier: p.supplier || '',
      description: p.description || ''
    });
    setFormError('');
    setShowAddModal(true);
  };

  // Open Add Product
  const handleOpenAdd = () => {
    setEditProduct(null);
    setFormData({
      name: '',
      sku: `TEX-${Date.now().toString().slice(-5)}`,
      barcode: '',
      category_id: categories.length > 0 ? String(categories[0].id) : '',
      hsn_code: '5208',
      unit: 'Pieces',
      purchase_price: 400,
      selling_price: 750,
      is_tax_inclusive: false,
      gst_rate: 5.0,
      stock_quantity: 20,
      min_stock_alert: 5.0,
      supplier: '',
      description: ''
    });
    setFormError('');
    setShowAddModal(true);
  };

  // Save Product (Add or Edit)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError('');

    try {
      if (editProduct) {
        await api.put(`/products/${editProduct.id}`, formData);
        setSuccessMsg(`Product "${formData.name}" updated successfully.`);
      } else {
        await api.post('/products', formData);
        setSuccessMsg(`Product "${formData.name}" created successfully.`);
      }
      setShowAddModal(false);
      fetchProducts();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Failed to save product.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Delete product
  const handleDeleteProduct = async (p: Product) => {
    if (!window.confirm(`Are you sure you want to delete or deactivate "${p.name}"?`)) return;
    try {
      const res = await api.delete(`/products/${p.id}`);
      setSuccessMsg(res.data?.message || 'Product removed successfully.');
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete product.');
    }
  };

  // Stock Adjustment Submit
  const handleSaveAdjustment = async () => {
    if (!adjustProduct || adjustQuantity <= 0) return;
    try {
      await api.post(`/products/${adjustProduct.id}/adjust-stock`, {
        type: adjustType,
        quantity: adjustQuantity,
        reason: adjustReason || 'Physical inventory verification'
      });
      setSuccessMsg(`Stock updated for ${adjustProduct.name}`);
      setAdjustProduct(null);
      setAdjustReason('');
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to adjust stock.');
    }
  };

  // View Stock History
  const handleViewHistory = async (p: Product) => {
    setHistoryProduct(p);
    setHistoryLoading(true);
    try {
      const res = await api.get(`/products/${p.id}/transactions`);
      setHistoryList(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Create Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await api.post('/products/categories', {
        name: newCatName.trim(),
        hsn_default: newCatHsn,
        gst_default: newCatGst
      });
      setNewCatName('');
      fetchCategories();
      setSuccessMsg('Category created successfully.');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create category.');
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Products & Inventory Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Catalog textile fabrics, sarees, ready-mades, HSN codes, and track warehouse stock levels.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold shadow-xs hover:bg-slate-50"
          >
            <Layers className="w-3.5 h-3.5" />
            Categories
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add New Product
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-semibold">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cloth name, SKU, barcode, HSN..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
          >
            <option value="">All Categories ({categories.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Stock Health Filter */}
          <select
            value={stockStatus}
            onChange={(e) => setStockStatus(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
          >
            <option value="">All Stock Levels</option>
            <option value="low_stock">⚠️ Low Stock Alerts</option>
            <option value="out_of_stock">❌ Out of Stock</option>
          </select>

        </div>

      </div>

      {/* PRODUCTS TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                <th className="py-3 px-3">Product Name</th>
                <th className="py-3 px-3">SKU / Barcode</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">HSN</th>
                <th className="py-3 px-3 text-right">Cost (₹)</th>
                <th className="py-3 px-3 text-right">Selling (₹)</th>
                <th className="py-3 px-3 text-center">GST%</th>
                <th className="py-3 px-3 text-right">Stock</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Loading textile inventory...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No products found. Click "Add New Product" to populate your catalog.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isLow = p.stock_quantity > 0 && p.stock_quantity <= p.min_stock_alert;
                  const isOut = p.stock_quantity <= 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      
                      {/* Name */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-950 dark:text-white text-sm">{p.name}</div>
                        {p.supplier && <span className="text-[10px] text-slate-400">Supplier: {p.supplier}</span>}
                      </td>

                      {/* SKU / Barcode */}
                      <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                        <div>{p.sku}</div>
                        {p.barcode && <div className="text-[10px] text-slate-400">{p.barcode}</div>}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3">
                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                          {p.category_name || 'General'}
                        </span>
                      </td>

                      {/* HSN */}
                      <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {p.hsn_code}
                      </td>

                      {/* Purchase Price */}
                      <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        ₹{Number(p.purchase_price).toFixed(2)}
                      </td>

                      {/* Selling Price */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-950 dark:text-white">
                        ₹{Number(p.selling_price).toFixed(2)}
                      </td>

                      {/* GST Rate */}
                      <td className="py-3 px-3 text-center font-mono">
                        <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded font-bold">
                          {p.gst_rate}%
                        </span>
                      </td>

                      {/* Stock Quantity */}
                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                        <div className={`font-bold ${
                          isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-900 dark:text-white'
                        }`}>
                          {p.stock_quantity} <span className="text-[10px] font-normal text-slate-400">{p.unit}</span>
                        </div>
                        {isLow && <span className="text-[10px] text-amber-600 font-medium">Low Stock</span>}
                        {isOut && <span className="text-[10px] text-red-600 font-bold">Out of Stock</span>}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          
                          {/* Stock In/Out Adjustment Button */}
                          <button
                            onClick={() => {
                              setAdjustProduct(p);
                              setAdjustQuantity(10);
                            }}
                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Adjust Stock (Stock In / Stock Out)"
                          >
                            <ArrowUpDown className="w-4 h-4" />
                          </button>

                          {/* View Ledger History */}
                          <button
                            onClick={() => handleViewHistory(p)}
                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="View Stock Transaction Ledger"
                          >
                            <History className="w-4 h-4" />
                          </button>

                          {/* Edit Product */}
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit Product Details"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Delete Product */}
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteProduct(p)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                              title="Delete or Deactivate Product"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT PRODUCT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl my-8 space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                {editProduct ? `Edit Product: ${editProduct.name}` : 'Add New Textile Product'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-400 rounded-xl font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Product / Cloth Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Kanchipuram Pure Silk Saree or Pure Cotton 40"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    SKU Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Barcode (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="Scan or leave blank"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Textile Category
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    HSN Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.hsn_code}
                    onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                    placeholder="e.g. 5007, 5208, 6205, 6302"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Unit of Measurement <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value as TextileUnit })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                  >
                    {TEXTILE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Applicable GST Slab
                  </label>
                  <select
                    value={formData.gst_rate}
                    onChange={(e) => setFormData({ ...formData, gst_rate: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                  >
                    {GST_SLABS.map(s => <option key={s} value={s}>{s}% GST</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Purchase Price / Cost (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.purchase_price}
                    onChange={(e) => setFormData({ ...formData, purchase_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Selling Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>

                {!editProduct && (
                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                      Initial Opening Stock
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={formData.stock_quantity}
                      onChange={(e) => setFormData({ ...formData, stock_quantity: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Low Stock Alert Level
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.min_stock_alert}
                    onChange={(e) => setFormData({ ...formData, min_stock_alert: parseFloat(e.target.value) || 5 })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Supplier / Weaver Source
                  </label>
                  <input
                    type="text"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    placeholder="e.g. Kanchipuram Weavers Co-op"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <label className="flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_tax_inclusive}
                      onChange={(e) => setFormData({ ...formData, is_tax_inclusive: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Selling price is GST-inclusive (MRP)</span>
                  </label>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Description & Fabric Details
                  </label>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Weave type, zari grade, thread count, size info..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-md"
                >
                  {formSubmitting ? 'Saving...' : editProduct ? 'Update Product' : 'Create Product'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {adjustProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-indigo-600">
              <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950/60 rounded-xl">
                <Boxes className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Inventory Stock Adjustment
                </h3>
                <p className="text-xs text-slate-500">
                  {adjustProduct.name} (Current: {adjustProduct.stock_quantity} {adjustProduct.unit})
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'stock_in', label: 'Stock In (+)' },
                    { id: 'stock_out', label: 'Stock Out (-)' },
                    { id: 'adjustment', label: 'Overwrite' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAdjustType(t.id as any)}
                      className={`py-2 rounded-lg font-bold border ${
                        adjustType === t.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Quantity ({adjustProduct.unit})
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Reason for Adjustment
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. New supplier shipment, audit count, damage..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAdjustProduct(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAdjustment}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md"
              >
                Apply Stock Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STOCK HISTORY DRAWER */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Inventory Ledger History
                </h3>
                <p className="text-xs text-slate-500">
                  {historyProduct.name} • SKU: {historyProduct.sku}
                </p>
              </div>
              <button onClick={() => setHistoryProduct(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="overflow-y-auto flex-1">
              {historyLoading ? (
                <div className="py-8 text-center text-slate-400">Loading ledger...</div>
              ) : historyList.length === 0 ? (
                <div className="py-8 text-center text-slate-400">No stock movements recorded yet.</div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-bold text-[11px]">
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2">Type</th>
                      <th className="py-2 px-2 text-right">Change</th>
                      <th className="py-2 px-2 text-right">Balance</th>
                      <th className="py-2 px-2">Ref / Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {historyList.map((tx: any) => (
                      <tr key={tx.id}>
                        <td className="py-2 px-2 text-slate-500">{tx.created_at?.slice(0, 16)}</td>
                        <td className="py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            tx.transaction_type === 'sale'
                              ? 'bg-rose-100 text-rose-700'
                              : tx.transaction_type === 'stock_in'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}>
                            {tx.transaction_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-bold">
                          {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity} {tx.unit}
                        </td>
                        <td className="py-2 px-2 text-right font-mono font-semibold text-slate-900 dark:text-white">
                          {tx.quantity_after} {tx.unit}
                        </td>
                        <td className="py-2 px-2 text-slate-600 dark:text-slate-400 truncate max-w-xs">
                          {tx.reason || tx.reference_id}
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
                onClick={() => setHistoryProduct(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORIES MANAGEMENT MODAL */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Manage Textile Categories
              </h3>
              <button onClick={() => setShowCategoryModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Add Category Form */}
            <form onSubmit={handleCreateCategory} className="flex gap-2 text-xs">
              <input
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="New Category Name (e.g. Suiting)"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <input
                type="text"
                value={newCatHsn}
                onChange={(e) => setNewCatHsn(e.target.value)}
                placeholder="HSN"
                className="w-20 px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl whitespace-nowrap"
              >
                Add
              </button>
            </form>

            {/* List */}
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {categories.map((c) => (
                <div key={c.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">{c.name}</span>
                    <span className="text-[10px] text-slate-400 ml-2 font-mono">HSN: {c.hsn_default} • {c.product_count || 0} products</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

