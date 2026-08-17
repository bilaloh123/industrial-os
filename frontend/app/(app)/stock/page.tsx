'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Download } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { RecordMovementModal } from '../../../components/stock/RecordMovementModal';

const HEALTH_LABEL: Record<string, string> = { GREEN: 'جيد', ORANGE: 'منخفض', RED: 'حرج', BLACK: 'نفد' };
const HEALTH_CLASS: Record<string, string> = {
  GREEN: 'text-success border-success/30',
  ORANGE: 'text-amber border-amber/30',
  RED: 'text-danger border-danger/30',
  BLACK: 'text-text-lo border-text-lo/30',
};

const MOVEMENT_LABEL: Record<string, string> = {
  PURCHASE_RECEIPT: 'استلام شراء', SALE: 'بيع', RETURN_IN: 'إرجاع عميل', RETURN_OUT: 'إرجاع مورد',
  TRANSFER: 'تحويل', ADJUSTMENT: 'تعديل', DAMAGE: 'تلف', LOSS: 'فقدان',
  INVENTORY_COUNT: 'تسوية جرد', INTERNAL_USE: 'استخدام داخلي',
};

export default function StockPage() {
  const [tab, setTab] = useState<'summary' | 'movements' | 'warehouses'>('summary');
  const [summary, setSummary] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.allSettled([api.getStockSummary(), api.listMovements(), api.listWarehouses(), api.listProducts()])
      .then(([s, m, w, p]) => {
        if (s.status === 'fulfilled') setSummary(s.value); else setError(s.reason?.message ?? 'تعذّر تحميل صحة المخزون');
        if (m.status === 'fulfilled') setMovements(m.value);
        if (w.status === 'fulfilled') setWarehouses(w.value);
        if (p.status === 'fulfilled') setProducts(p.value);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {[['summary', 'صحة المخزون'], ['movements', 'حركات المخزون'], ['warehouses', 'المستودعات']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as any)}
              className={`px-3 py-1.5 rounded text-[12.5px] border ${tab === id ? 'bg-surface-alt text-text-hi border-border-lite' : 'text-text-lo border-transparent'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => api.exportStockExcel().catch((e) => setError(e.message))}
            className="flex items-center gap-1.5 px-3 py-2 rounded border border-border text-text-mid text-[12.5px]">
            <Download size={15} /> تصدير Excel
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-amber text-[12.5px] font-bold" style={{ color: '#1A1305' }}>
            <Plus size={15} /> حركة جديدة
          </button>
        </div>
      </div>

      {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}
      {loading && <div className="text-text-lo text-[12.5px] font-mono">جاري التحميل...</div>}

      {!loading && tab === 'summary' && (
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-text-lo">
                {['المرجع', 'المنتج', 'الرصيد الفعلي', 'محجوز', 'المتوفر للبيع', 'نقطة إعادة الطلب', 'الحالة'].map((h) => (
                  <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-text-lo">لا توجد بيانات — أضف منتجات وسجّل حركات</td></tr>
              )}
              {summary.map((s) => (
                <tr key={s.productId} className="border-b border-border hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-text-hi">{s.internalRef}</td>
                  <td className="px-4 py-2.5 text-text-mid">{s.name}</td>
                  <td className="px-4 py-2.5 font-mono text-text-hi">{s.onHand}</td>
                  <td className="px-4 py-2.5 font-mono text-amber">{s.reserved > 0 ? `-${s.reserved}` : '0'}</td>
                  <td className="px-4 py-2.5 font-mono text-text-hi font-semibold">{s.available}</td>
                  <td className="px-4 py-2.5 font-mono text-text-lo">{s.reorderPoint}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10.5px] border ${HEALTH_CLASS[s.health]}`}>{HEALTH_LABEL[s.health]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-border text-text-lo text-[11px]">
            المتوفر للبيع = الرصيد الفعلي − المحجوز (يُحجز المخزون فور تأكيد طلب البيع، قبل التسليم)
          </div>
        </div>
      )}

      {!loading && tab === 'movements' && (
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-text-lo">
                {['المنتج', 'المستودع', 'النوع', 'الكمية', 'السبب', 'التاريخ'].map((h) => (
                  <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-text-lo">لا توجد حركات مسجلة بعد</td></tr>
              )}
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-border hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-text-hi">{m.product.internalRef}</td>
                  <td className="px-4 py-2.5 text-text-mid">{m.warehouse.name}</td>
                  <td className="px-4 py-2.5 text-info">{MOVEMENT_LABEL[m.type]}</td>
                  <td className={`px-4 py-2.5 font-mono ${m.quantity > 0 ? 'text-success' : 'text-danger'}`}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="px-4 py-2.5 text-text-lo">{m.reason ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-text-lo text-[11px]">
                    {new Date(m.createdAt).toLocaleString('fr-MA')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-border text-text-lo text-[11px]">
            سجل غير قابل للتعديل — أي تصحيح ينشئ حركة جديدة (PHASE 19)
          </div>
        </div>
      )}

      {!loading && tab === 'warehouses' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {warehouses.length === 0 && <div className="text-text-lo text-[12.5px]">لا توجد مستودعات بعد</div>}
          {warehouses.map((w) => (
            <div key={w.id} className="p-4 rounded bg-surface border border-border">
              <div className="flex items-center justify-between">
                <span className="text-text-hi text-[13.5px] font-semibold">{w.name}</span>
                <span className="px-1.5 py-0.5 rounded text-[10.5px] font-mono text-text-lo border border-border">{w.code}</span>
              </div>
              <div className="text-text-lo text-[11.5px] mt-1">{w.address ?? '—'}</div>
              <div className="text-text-lo text-[11px] font-mono mt-2">{w.zones?.length ?? 0} مناطق تخزين</div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <RecordMovementModal products={products} warehouses={warehouses} onClose={() => setShowModal(false)} onCreated={refresh} />
      )}
    </div>
  );
}
