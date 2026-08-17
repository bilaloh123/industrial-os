'use client';

import { useState } from 'react';
import { api } from '../../lib/api-client';

const TYPES = [
  { value: 'PURCHASE_RECEIPT', label: 'استلام شراء (+)' },
  { value: 'RETURN_IN', label: 'إرجاع من عميل (+)' },
  { value: 'TRANSFER', label: 'تحويل (-)' },
  { value: 'ADJUSTMENT', label: 'تعديل يدوي (±)' },
  { value: 'DAMAGE', label: 'تلف (-)' },
  { value: 'LOSS', label: 'فقدان (-)' },
  { value: 'INVENTORY_COUNT', label: 'تسوية جرد (±)' },
  { value: 'SALE', label: 'بيع (-)' },
  { value: 'RETURN_OUT', label: 'إرجاع لمورد (-)' },
  { value: 'INTERNAL_USE', label: 'استخدام داخلي (-)' },
];

export function RecordMovementModal({
  products,
  warehouses,
  onClose,
  onCreated,
}: {
  products: any[];
  warehouses: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [type, setType] = useState('PURCHASE_RECEIPT');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!productId || !warehouseId || !quantity) {
      setError('اختر المنتج، المستودع، وأدخل الكمية');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const qty = Number(quantity);
      // outgoing movement types are recorded as negative quantities in the ledger
      const isOutgoing = ['TRANSFER', 'DAMAGE', 'LOSS', 'SALE', 'RETURN_OUT', 'INTERNAL_USE'].includes(type);
      const result = await api.recordMovement({
        productId,
        warehouseId,
        type,
        quantity: isOutgoing ? -Math.abs(qty) : Math.abs(qty),
        reason: reason || undefined,
      });
      // PHASE 53: offline queueing — the movement was saved locally and will
      // sync automatically once connectivity returns; tell the user plainly
      // instead of pretending it already reached the server.
      if (result?.queued) {
        alert('لا يوجد اتصال بالإنترنت — تم حفظ الحركة محلياً وستتم مزامنتها تلقائياً عند رجوع الاتصال.');
      }
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(10,12,14,0.7)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm p-6 rounded bg-surface border border-border-lite">
        <div className="text-text-hi text-[14px] font-semibold mb-4">تسجيل حركة مخزون</div>

        <div className="mb-3">
          <label className="block mb-1 text-[12px] text-text-mid">المنتج</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none">
            <option value="">— اختر —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.internalRef} — {p.name}</option>)}
          </select>
        </div>

        <div className="mb-3">
          <label className="block mb-1 text-[12px] text-text-mid">المستودع</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none">
            <option value="">— اختر —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block mb-1 text-[12px] text-text-mid">نوع الحركة</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[12.5px] outline-none">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block mb-1 text-[12px] text-text-mid">الكمية</label>
            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi font-mono text-[13px] outline-none" />
          </div>
        </div>

        <div className="mb-4">
          <label className="block mb-1 text-[12px] text-text-mid">السبب / ملاحظة (اختياري)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none" />
        </div>

        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border border-border text-text-mid text-[13px]">إلغاء</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded bg-amber font-bold text-[13px] disabled:opacity-60" style={{ color: '#1A1305' }}>
            {saving ? 'جاري التسجيل...' : 'تسجيل الحركة'}
          </button>
        </div>
      </div>
    </div>
  );
}
