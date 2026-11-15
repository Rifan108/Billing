import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Barcode, Tag, Check, Copy } from 'lucide-react';
import api from '../../services/api';
import { Product, ProductVariant, ShopSettings } from '../../types';

interface BarcodeLabelModalProps {
  initialProduct?: Product | null;
  initialVariant?: ProductVariant | null;
  onClose: () => void;
}

export const BarcodeLabelModal: React.FC<BarcodeLabelModalProps> = ({
  initialProduct,
  initialVariant,
  onClose
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | ''>(initialProduct ? initialProduct.id : '');
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | ''>(initialVariant ? initialVariant.id : '');
  const [labelCount, setLabelCount] = useState<number>(12);
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [labels, setLabels] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/shop').then(res => setShop(res.data)).catch(() => {});
    api.get('/products').then(res => {
      setProducts(res.data);
      if (!selectedProductId && res.data.length > 0) {
        setSelectedProductId(res.data[0].id);
      }
    }).catch(() => {});
  }, []);

  // Load variants when product changes
  useEffect(() => {
    if (selectedProductId) {
      api.get(`/products/${selectedProductId}/variants`).then(res => {
        setVariants(res.data);
      }).catch(() => setVariants([]));
    } else {
      setVariants([]);
      setSelectedVariantId('');
    }
  }, [selectedProductId]);

  // Generate labels
  const handleGenerate = async () => {
    if (!selectedProductId && !selectedVariantId) return;
    setLoading(true);

    try {
      const payload = {
        items: [
          {
            product_id: selectedProductId || undefined,
            variant_id: selectedVariantId || undefined,
            count: labelCount
          }
        ]
      };
      const res = await api.post('/products/barcode/labels', payload);
      setLabels(res.data.labels || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedProductId || selectedVariantId) {
      handleGenerate();
    }
  }, [selectedProductId, selectedVariantId, labelCount]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-indigo-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Barcode className="w-5 h-5" />
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">Print Barcode Labels</h3>
              <p className="text-[11px] text-indigo-100">Generate high-density scannable barcode stickers for products & variants</p>
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

        {/* Controls Bar */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs shrink-0">
          <div>
            <label className="block text-slate-500 font-bold mb-1">Select Product</label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(Number(e.target.value));
                setSelectedVariantId('');
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {variants.length > 0 && (
            <div>
              <label className="block text-slate-500 font-bold mb-1">Variant (Optional)</label>
              <select
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
              >
                <option value="">All / Parent Product</option>
                {variants.map(v => (
                  <option key={v.id} value={v.id}>{v.variant_name} ({v.sku})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-slate-500 font-bold mb-1">Number of Labels</label>
            <select
              value={labelCount}
              onChange={(e) => setLabelCount(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium font-mono"
            >
              <option value={4}>4 Labels</option>
              <option value={8}>8 Labels</option>
              <option value={12}>12 Labels</option>
              <option value={24}>24 Labels (A4 Sheet)</option>
              <option value={48}>48 Labels</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handlePrint}
              disabled={labels.length === 0}
              className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              Print Labels Sheet
            </button>
          </div>
        </div>

        {/* Labels Preview Sheet (Printable Area) */}
        <div ref={printAreaRef} className="flex-1 overflow-y-auto p-4 bg-slate-100 dark:bg-slate-950">
          {labels.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Barcode className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-sm font-semibold">No labels generated yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {labels.map((lbl, idx) => (
                <div
                  key={idx}
                  className="bg-white text-slate-900 border border-slate-300 rounded-lg p-2.5 shadow-xs flex flex-col items-center justify-between text-center select-none"
                  style={{ minHeight: '120px' }}
                >
                  <div className="w-full border-b border-slate-200 pb-1 mb-1">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 truncate">
                      {shop?.shop_name || 'Sri Lakshmi Silks'}
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {lbl.title}
                    </div>
                  </div>

                  {/* Barcode SVG */}
                  <div
                    className="w-full flex justify-center my-1"
                    dangerouslySetInnerHTML={{ __html: lbl.svg }}
                  />

                  <div className="w-full flex items-center justify-between pt-1 border-t border-slate-200 text-[10px]">
                    <span className="font-mono text-slate-500 font-bold truncate">
                      {lbl.sku}
                    </span>
                    <span className="font-mono font-black text-xs text-indigo-700">
                      ₹{lbl.price}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Total {labels.length} scannable barcode stickers generated</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg font-semibold text-slate-700 dark:text-slate-300"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
