'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api-client';

type Line = { productId: string; variantId: string; quantity: string; unitPrice: string };

export function CreateOrderModal({
  customers,
  products,
  onClose,
  onCreated,
}: {
  customers: any[];
  products: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', variantId: '', quantity: '1', unitPrice: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [marginWarning, setMarginWarning] = useState<any[] | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [saving, setSaving] = useState(false);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { productId: '', variantId: '', quantity: '1', unitPrice: '' }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    if (!customerId || lines.some((l) => !l.productId || !l.unitPrice)) {
      setError('اختر العميل وعبّي كل أسطر المنتجات');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createSalesOrder({
        customerId,
        marginOverrideReason: overrideReason || undefined,
        items: lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId || undefined,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        })),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      // Minimum Margin Protection (PHASE 26): backend returns 403 with
      // { message, belowMinMargin: [...] } — surface it as an authorization prompt.
      if (e.belowMinMargin) {
        setMarginWarning(e.belowMinMargin);
      } else {
        setError(e.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(10,12,14,0.7)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 rounded bg-surface border border-border-lite">
        <div className="text-text-hi text-[14px] font-semibold mb-4">عرض سعر / طلب بيع جديد</div>

        <div className="mb-4">
          <label className="block mb-1 text-[12px] text-text-mid">العميل</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none">
            <option value="">— اختر —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="text-text-lo text-[11px] font-mono mb-2">المنتجات</div>
        {lines.map((line, i) => {
          const product = products.find((p) => p.id === line.productId);
          const variants = product?.variants ?? [];
          return (
            <div key={i} className="mb-2">
              <div className="grid grid-cols-[1fr_70px_90px_auto] gap-2">
                <select value={line.productId} onChange={(e) => updateLine(i, { productId: e.target.value, variantId: '' })}
                  className="px-2 py-1.5 rounded bg-surface-alt border border-border text-text-hi text-[12px] outline-none">
                  <option value="">— منتج —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.internalRef}</option>)}
                </select>
                <input type="number" placeholder="كمية" value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  className="px-2 py-1.5 rounded bg-surface-alt border border-border text-text-hi font-mono text-[12px] outline-none" />
                <input type="number" placeholder="السعر" value={line.unitPrice} onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                  className="px-2 py-1.5 rounded bg-surface-alt border border-border text-text-hi font-mono text-[12px] outline-none" />
                <button onClick={() => removeLine(i)} className="text-text-lo hover:text-danger"><Trash2 size={15} /></button>
              </div>
              {variants.length > 0 && (
                <select value={line.variantId} onChange={(e) => updateLine(i, { variantId: e.target.value })}
                  className="w-full mt-1 px-2 py-1.5 rounded bg-surface-alt border border-border text-amber font-mono text-[11.5px] outline-none">
                  <option value="">— بدون تركيبة محددة (SKU الأساسي) —</option>
                  {variants.map((v: any) => <option key={v.id} value={v.id}>{v.sku}</option>)}
                </select>
              )}
            </div>
          );
        })}
        <button onClick={addLine} className="flex items-center gap-1 text-amber text-[12px] mb-4">
          <Plus size={13} /> إضافة سطر
        </button>

        {marginWarning && (
          <div className="mb-4 p-3 rounded border border-danger/40 bg-danger/10">
            <div className="text-danger text-[12.5px] font-semibold mb-1">AUTHORIZATION REQUIRED</div>
            <div className="text-text-mid text-[11.5px] mb-2">
              سعر البيع تحت الهامش الأدنى المسموح لـ {marginWarning.length} منتج. أدخل سبب الاستثناء للمتابعة (PHASE 26).
            </div>
            <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="مثال: عميل استراتيجي - موافقة المدير"
              className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[12.5px] outline-none" />
          </div>
        )}

        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border border-border text-text-mid text-[13px]">إلغاء</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded bg-amber font-bold text-[13px] disabled:opacity-60" style={{ color: '#1A1305' }}>
            {saving ? 'جاري الحفظ...' : marginWarning ? 'تأكيد رغم الهامش المنخفض' : 'إنشاء الطلب'}
          </button>
        </div>
      </div>
    </div>
  );
}
