import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit3, Barcode, Check, AlertCircle, Sparkles, Layers } from 'lucide-react';
import api from '../../services/api';
import { Product, ProductVariant } from '../../types';

interface ProductVariantsModalProps {
  product: Product;
  onClose: () => void;
  onUpdate?: () => void;
  onPrintBarcode?: (p: Product, v: ProductVariant) => void;
}

export const ProductVariantsModal: React.FC<ProductVariantsModalProps> = ({
  product,
  onClose,
  onUpdate,
  onPrintBarcode
}) => {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);

  // Form State
  const [variantName, setVariantName] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [pattern, setPattern] = useState('');
  const [material, setMaterial] = useState('');
  const [brand, setBrand] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number | ''>(product.purchase_price || 0);
  const [sellingPrice, setSellingPrice] = useState<number | ''>(product.selling_price || 0);
  const [gstRate, setGstRate] = useState<number>(product.gst_rate || 5);
  const [stockQuantity, setStockQuantity] = useState<number>(10);
  const [minStockAlert, setMinStockAlert] = useState<number>(3);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchVariants = () => {
    setLoading(true);
    api.get(`/products/${product.id}/variants`)
      .then(res => setVariants(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchVariants();
  }, [product.id]);

  const handleGenerateBarcode = async () => {
    try {
      const res = await api.get('/products/barcode/generate');
      setBarcode(res.data.barcode);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenAdd = () => {
    setEditingVariant(null);
    setVariantName('');
    setColor('');
    setSize('');
    setPattern('');
    setMaterial('');
    setBrand(product.brand || '');
    const rand = Math.floor(100 + Math.random() * 900);
    setSku(`${product.sku}-VAR-${rand}`);
    setPurchasePrice(product.purchase_price || 0);
    setSellingPrice(product.selling_price || 0);
    setGstRate(product.gst_rate || 5);
    setStockQuantity(10);
    setMinStockAlert(3);
    setError('');
    handleGenerateBarcode();
    setShowAddForm(true);
  };

  const handleOpenEdit = (v: ProductVariant) => {
    setEditingVariant(v);
    setVariantName(v.variant_name);
    setColor(v.color || '');
    setSize(v.size || '');
    setPattern(v.pattern || '');
    setMaterial(v.material || '');
    setBrand(v.brand || '');
    setSku(v.sku);
    setBarcode(v.barcode || '');
    setPurchasePrice(v.purchase_price);
    setSellingPrice(v.selling_price);
    setGstRate(v.gst_rate);
    setStockQuantity(v.stock_quantity);
    setMinStockAlert(v.min_stock_alert);
    setError('');
    setShowAddForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!variantName.trim()) {
      setError('Variant name is required');
      return;
    }
    if (!sku.trim()) {
      setError('Variant SKU is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
        variant_name: variantName.trim(),
        color: color.trim() || null,
        size: size.trim() || null,
        pattern: pattern.trim() || null,
        material: material.trim() || null,
        brand: brand.trim() || null,
        sku: sku.trim().toUpperCase(),
        barcode: barcode.trim() || null,
        purchase_price: Number(purchasePrice) || 0,
        selling_price: Number(sellingPrice) || 0,
        gst_rate: Number(gstRate) || 5,
        stock_quantity: Number(stockQuantity) || 0,
        min_stock_alert: Number(minStockAlert) || 3
      };

      if (editingVariant) {
        await api.put(`/products/variants/${editingVariant.id}`, payload);
      } else {
        await api.post(`/products/${product.id}/variants`, payload);
      }

      setShowAddForm(false);
      fetchVariants();
      onUpdate?.();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save variant');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (variantId: number, name: string) => {
    if (!window.confirm(`Delete variant "${name}"?`)) return;
    try {
      await api.delete(`/products/variants/${variantId}`);
      fetchVariants();
      onUpdate?.();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete variant');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-indigo-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">Product Variants</h3>
              <p className="text-[11px] text-indigo-100">{product.name} ({product.sku})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-indigo-700 rounded-lg text-indigo-100 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Viewport */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Action Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Configured Variations ({variants.length})
            </span>
            {!showAddForm && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Variant
              </button>
            )}
          </div>

          {/* Add / Edit Form Modal Card */}
          {showAddForm && (
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-indigo-200 dark:border-indigo-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                  {editingVariant ? `Edit Variant: ${editingVariant.variant_name}` : 'New Variant Details'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Cancel
                </button>
              </div>

              {error && (
                <div className="p-2.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">
                      Variant Name * (e.g. Navy Blue - Size 40)
                    </label>
                    <input
                      type="text"
                      required
                      value={variantName}
                      onChange={(e) => setVariantName(e.target.value)}
                      placeholder="e.g. Red - Size XL"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">Color</label>
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      placeholder="e.g. Royal Blue"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">Size</label>
                    <input
                      type="text"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      placeholder="e.g. M / 38 / 42"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">Variant SKU *</label>
                    <input
                      type="text"
                      required
                      value={sku}
                      onChange={(e) => setSku(e.target.value.toUpperCase())}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono uppercase font-bold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">Barcode</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="Scan or auto-generate"
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateBarcode}
                        className="px-2 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 rounded-lg text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" />
                        Generate
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">Stock Quantity *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(parseFloat(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">Selling Price (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">Cost Price (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-bold mb-1">Min Stock Alert</label>
                    <input
                      type="number"
                      min="1"
                      value={minStockAlert}
                      onChange={(e) => setMinStockAlert(parseFloat(e.target.value) || 1)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    {saving ? 'Saving...' : (editingVariant ? 'Update Variant' : 'Save Variant')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Variants Table */}
          {variants.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Layers className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-sm font-semibold">No variants created for this product yet</p>
              <p className="text-xs text-slate-400 mt-1">Click "+ Add New Variant" to create color, size, and pattern options.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-bold text-[11px] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Variant Name</th>
                    <th className="py-2.5 px-3">Color / Size</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3 text-right">Selling Price</th>
                    <th className="py-2.5 px-3 text-right">Stock</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {variants.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                        {v.variant_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {v.color || v.size ? `${v.color || ''} ${v.size ? `(${v.size})` : ''}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                        {v.sku}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {v.barcode || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-indigo-600 dark:text-indigo-400">
                        ₹{v.selling_price}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                          v.stock_quantity <= 0
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
                            : v.stock_quantity <= v.min_stock_alert
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                        }`}>
                          {v.stock_quantity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            title="Print Barcode Labels"
                            onClick={() => onPrintBarcode?.(product, v)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                          >
                            <Barcode className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Edit Variant"
                            onClick={() => handleOpenEdit(v)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete Variant"
                            onClick={() => handleDelete(v.id, v.variant_name)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
