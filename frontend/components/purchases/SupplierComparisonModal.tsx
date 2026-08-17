'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api-client';

export function SupplierComparisonModal({
  products,
  suppliers,
  onClose,
}: {
  products: any[];
  suppliers: any[];
  onClose: () => void;
}) {
  const [productId, setProductId] = useState('');
  const [ranked, setRanked] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // add-offer form
  const [showAddOffer, setShowAddOffer] = useState(false);
  const [offerSupplierId, setOfferSupplierId] = useState('');
  const [offerCost, setOfferCost] = useState('');
  const [offerLeadTime, setOfferLeadTime] = useState('');
  const [saving, setSaving] = useState(false);

  function loadComparison(pid: string) {
    if (!pid) { setRanked([]); return; }
    setLoading(true);
    setError(null);
    api.compareSuppliersForProduct(pid)
      .then(setRanked)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadComparison(productId); }, [productId]);

  async function addOffer() {
    if (!productId || !offerSupplierId || !offerCost) { setError('عبّي كل الحقول'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.addSupplierOffer(offerSupplierId, {
        productId, unitCost: Number(offerCost),
        leadTimeDays: offerLeadTime ? Number(offerLeadTime) : undefined,
      });
      setOfferSupplierId(''); setOfferCost(''); setOfferLeadTime(''); setShowAddOffer(false);
      loadComparison(productId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(10,12,14,0.7)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 rounded bg-surface border border-border-lite">
        <div className="text-text-hi text-[14px] font-semibold mb-1">مقارنة الموردين</div>
        <div className="text-text-lo text-[11.5px] mb-4">الأفضل ليس بالضرورة الأرخص — التقييم يجمع السعر، الموثوقية، ومدة التسليم</div>

        <div className="mb-4">
          <label className="block mb-1 text-[12px] text-text-mid">اختر منتجاً</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none">
            <option value="">— اختر —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.internalRef} — {p.name}</option>)}
          </select>
        </div>

        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}
        {loading && <div className="text-text-lo text-[12.5px] font-mono">جاري التحميل...</div>}

        {!loading && productId && ranked.length === 0 && (
          <div className="text-text-lo text-[12.5px] text-center py-4">لا توجد عروض أسعار لهذا المنتج بعد</div>
        )}

        {ranked.length > 0 && (
          <div className="rounded border border-border overflow-hidden mb-4">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-text-lo">
                  {['المورد', 'السعر', 'مدة التسليم', 'الموثوقية', 'التقييم المركب', ''].map((h) => (
                    <th key={h} className="text-right px-3 py-2 font-normal text-[10.5px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((r) => (
                  <tr key={r.supplierId} className="border-b border-border last:border-0"
                    style={{ background: r.best ? 'rgba(79,174,124,0.08)' : 'transparent' }}>
                    <td className="px-3 py-2 text-text-hi">{r.supplierName}</td>
                    <td className="px-3 py-2 font-mono text-text-mid">{r.unitCost} {r.currency}</td>
                    <td className="px-3 py-2 font-mono text-text-mid">{r.leadTimeDays} يوم</td>
                    <td className="px-3 py-2 font-mono" style={{ color: r.reliability > 85 ? '#4FAE7C' : '#F0A93B' }}>
                      {r.reliability}%{r.reliabilitySampleSize === 0 && <span className="text-text-lo text-[9.5px]"> (بدون تاريخ)</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-text-hi font-semibold">{r.compositeScore}</td>
                    <td className="px-3 py-2">
                      {r.best && <span className="px-1.5 py-0.5 rounded text-[10px] border text-success border-success/30">الأفضل</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {productId && !showAddOffer && (
          <button onClick={() => setShowAddOffer(true)} className="flex items-center gap-1.5 text-amber text-[12px] mb-2">
            <Plus size={13} /> إضافة عرض سعر مورد
          </button>
        )}

        {showAddOffer && (
          <div className="p-3 rounded bg-surface-alt border border-border mb-2">
            <div className="grid grid-cols-3 gap-2 mb-2">
              <select value={offerSupplierId} onChange={(e) => setOfferSupplierId(e.target.value)}
                className="px-2 py-1.5 rounded bg-bg border border-border text-text-hi text-[11.5px] outline-none">
                <option value="">— مورد —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input value={offerCost} onChange={(e) => setOfferCost(e.target.value)} type="number" placeholder="السعر"
                className="px-2 py-1.5 rounded bg-bg border border-border text-text-hi font-mono text-[11.5px] outline-none" />
              <input value={offerLeadTime} onChange={(e) => setOfferLeadTime(e.target.value)} type="number" placeholder="مدة التسليم (يوم)"
                className="px-2 py-1.5 rounded bg-bg border border-border text-text-hi font-mono text-[11.5px] outline-none" />
            </div>
            <button onClick={addOffer} disabled={saving}
              className="px-3 py-1.5 rounded bg-amber text-[11.5px] font-bold disabled:opacity-60" style={{ color: '#1A1305' }}>
              {saving ? 'جاري الحفظ...' : 'حفظ العرض'}
            </button>
          </div>
        )}

        <button onClick={onClose} className="w-full mt-4 py-2 rounded border border-border text-text-mid text-[13px]">إغلاق</button>
      </div>
    </div>
  );
}
