'use client';

import { useState } from 'react';
import { api } from '../../lib/api-client';

export function CreateImportModal({
  purchaseOrders,
  onClose,
  onCreated,
}: {
  purchaseOrders: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('');
  const [carrier, setCarrier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // only orders that are ORDERED/RECEIVING/RECEIVED can have an import dossier
  const eligible = purchaseOrders.filter((po) => ['ORDERED', 'RECEIVING', 'RECEIVED'].includes(po.status));

  async function submit() {
    if (!purchaseOrderId) { setError('اختر طلب شراء'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.createImport({ purchaseOrderId, countryOfOrigin: countryOfOrigin || undefined, carrier: carrier || undefined });
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
        <div className="text-text-hi text-[14px] font-semibold mb-4">ملف استيراد جديد</div>

        <div className="mb-3">
          <label className="block mb-1 text-[12px] text-text-mid">طلب الشراء</label>
          <select value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none">
            <option value="">— اختر —</option>
            {eligible.map((po) => <option key={po.id} value={po.id}>{po.supplier.name} — {po.id}</option>)}
          </select>
        </div>

        <div className="mb-3">
          <label className="block mb-1 text-[12px] text-text-mid">بلد المنشأ</label>
          <input value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none" />
        </div>

        <div className="mb-4">
          <label className="block mb-1 text-[12px] text-text-mid">الناقل</label>
          <input value={carrier} onChange={(e) => setCarrier(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none" />
        </div>

        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border border-border text-text-mid text-[13px]">إلغاء</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded bg-amber font-bold text-[13px] disabled:opacity-60" style={{ color: '#1A1305' }}>
            {saving ? 'جاري الإنشاء...' : 'إنشاء الملف'}
          </button>
        </div>
      </div>
    </div>
  );
}
