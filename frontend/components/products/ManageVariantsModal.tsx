'use client';

import { useEffect, useState } from 'react';
import { Plus, Archive } from 'lucide-react';
import { api } from '../../lib/api-client';

export function ManageVariantsModal({
  product,
  attributeDefs,
  onClose,
}: {
  product: any;
  attributeDefs: any[];
  onClose: () => void;
}) {
  const [variants, setVariants] = useState<any[]>([]);
  const [stockByVariant, setStockByVariant] = useState<Record<string, any>>({});
  const [sku, setSku] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [attrValues, setAttrValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    Promise.all([api.listVariants(product.id), api.getVariantStockSummary(product.id)])
      .then(([v, stock]) => {
        setVariants(v);
        setStockByVariant(Object.fromEntries(stock.map((s: any) => [s.variantId, s])));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(refresh, [product.id]);

  async function submit() {
    if (!sku.trim()) { setError('أدخل SKU'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.createVariant(product.id, {
        sku,
        sellingPrice: sellingPrice ? Number(sellingPrice) : undefined,
        attributeValues: Object.entries(attrValues).filter(([, v]) => v.trim()).map(([attributeDefinitionId, value]) => ({ attributeDefinitionId, value })),
      });
      setSku(''); setSellingPrice(''); setAttrValues({});
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function archive(variantId: string) {
    await api.archiveVariant(product.id, variantId).catch((e) => setError(e.message));
    refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(10,12,14,0.7)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 rounded bg-surface border border-border-lite">
        <div className="text-text-hi text-[14px] font-semibold mb-1">تركيبات المنتج (Variants)</div>
        <div className="text-text-lo text-[11.5px] font-mono mb-4">{product.internalRef} — {product.name}</div>

        <div className="rounded border border-border bg-surface-alt overflow-hidden mb-4">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-text-lo">
                {['SKU', 'الخصائص المميزة', 'المتوفر', 'السعر', ''].map((h) => (
                  <th key={h} className="text-right px-3 py-2 font-normal text-[10.5px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-3 py-4 text-center text-text-lo font-mono">جاري التحميل...</td></tr>}
              {!loading && variants.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-text-lo">لا توجد تركيبات بعد — هذا المنتج يُباع بمرجعه الأساسي فقط</td></tr>
              )}
              {variants.map((v) => {
                const stock = stockByVariant[v.id];
                return (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-mono text-text-hi">{v.sku}</td>
                    <td className="px-3 py-2 font-mono text-text-lo text-[10.5px]">
                      {v.attributeValues.map((av: any) => `${av.attributeDefinition.label}: ${av.value}`).join(' · ') || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono" style={{ color: stock?.available > 0 ? '#4FAE7C' : '#7C8492' }}>
                      {stock ? `${stock.available}${stock.reserved > 0 ? ` (−${stock.reserved} محجوز)` : ''}` : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-hi">{v.sellingPrice ? `${v.sellingPrice} MAD` : '—'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => archive(v.id)} className="text-text-lo hover:text-danger"><Archive size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-3 rounded bg-surface-alt border border-border">
          <div className="text-text-lo text-[11px] font-mono mb-2">إضافة تركيبة جديدة</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU"
              className="px-2 py-1.5 rounded bg-bg border border-border text-text-hi font-mono text-[12px] outline-none" dir="ltr" />
            <input value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} type="number" placeholder="السعر (MAD)"
              className="px-2 py-1.5 rounded bg-bg border border-border text-text-hi font-mono text-[12px] outline-none" />
          </div>
          {attributeDefs.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              {attributeDefs.map((a) => (
                <div key={a.id}>
                  <label className="block mb-0.5 text-[10.5px] text-text-mid">{a.label}{a.unit ? ` (${a.unit})` : ''}</label>
                  <input value={attrValues[a.id] ?? ''} onChange={(e) => setAttrValues({ ...attrValues, [a.id]: e.target.value })}
                    className="w-full px-2 py-1 rounded bg-bg border border-border text-text-hi font-mono text-[11.5px] outline-none" />
                </div>
              ))}
            </div>
          )}
          {error && <div className="mb-2 text-danger text-[11.5px]">{error}</div>}
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber text-[11.5px] font-bold disabled:opacity-60" style={{ color: '#1A1305' }}>
            <Plus size={13} /> {saving ? 'جاري الإضافة...' : 'إضافة تركيبة'}
          </button>
        </div>

        <button onClick={onClose} className="w-full mt-4 py-2 rounded border border-border text-text-mid text-[13px]">إغلاق</button>
      </div>
    </div>
  );
}
