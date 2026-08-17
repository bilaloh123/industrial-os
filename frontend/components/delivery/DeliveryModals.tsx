'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api-client';

export function CreateDeliveryModal({
  packedOrders,
  warehouses,
  onClose,
  onCreated,
}: {
  packedOrders: any[];
  warehouses: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [salesOrderId, setSalesOrderId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!salesOrderId || !warehouseId) { setError('اختر الطلب والمستودع'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.createDelivery({ salesOrderId, warehouseId, address: address || undefined });
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
        <div className="text-text-hi text-[14px] font-semibold mb-1">توصيل جديد</div>
        <div className="text-text-lo text-[11px] mb-4">فقط الطلبات المعبأة (PACKED) وغير المرتبطة بتوصيل سابق تظهر هنا</div>

        <div className="mb-3">
          <label className="block mb-1 text-[12px] text-text-mid">طلب البيع</label>
          <select value={salesOrderId} onChange={(e) => setSalesOrderId(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none">
            <option value="">— اختر —</option>
            {packedOrders.map((o) => <option key={o.id} value={o.id}>{o.customer.name} — {o.id}</option>)}
          </select>
          {packedOrders.length === 0 && <div className="text-text-lo text-[11px] mt-1">لا توجد طلبات معبأة بانتظار التوصيل حالياً</div>}
        </div>

        <div className="mb-3">
          <label className="block mb-1 text-[12px] text-text-mid">مستودع الانطلاق</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none">
            <option value="">— اختر —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        <div className="mb-4">
          <label className="block mb-1 text-[12px] text-text-mid">عنوان التسليم (اختياري)</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none" />
        </div>

        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border border-border text-text-mid text-[13px]">إلغاء</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded bg-amber font-bold text-[13px] disabled:opacity-60" style={{ color: '#1A1305' }}>
            {saving ? 'جاري الحفظ...' : 'إنشاء التوصيل'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddDriverModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) { setError('أدخل اسم السائق'); return; }
    setSaving(true);
    setError(null);
    try {
      await api.createDriver({ name: name.trim(), phone: phone || undefined, vehicleInfo: vehicleInfo || undefined });
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
        <div className="text-text-hi text-[14px] font-semibold mb-4">سائق جديد</div>
        <div className="mb-3">
          <label className="block mb-1 text-[12px] text-text-mid">الاسم</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none" />
        </div>
        <div className="mb-3">
          <label className="block mb-1 text-[12px] text-text-mid">الهاتف</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi font-mono text-[13px] outline-none" dir="ltr" />
        </div>
        <div className="mb-4">
          <label className="block mb-1 text-[12px] text-text-mid">معلومات المركبة</label>
          <input value={vehicleInfo} onChange={(e) => setVehicleInfo(e.target.value)} placeholder="مثال: شاحنة صغيرة — 12345-A-6"
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none" />
        </div>
        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border border-border text-text-mid text-[13px]">إلغاء</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded bg-amber font-bold text-[13px] disabled:opacity-60" style={{ color: '#1A1305' }}>
            {saving ? 'جاري الحفظ...' : 'إضافة'}
          </button>
        </div>
      </div>
    </div>
  );
}
