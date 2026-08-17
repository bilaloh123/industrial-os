'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Truck, UserPlus, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { CreateDeliveryModal, AddDriverModal } from '../../../components/delivery/DeliveryModals';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'بانتظار سائق', ASSIGNED: 'تم التعيين', IN_TRANSIT: 'قيد النقل',
  DELIVERED: 'تم التسليم', FAILED: 'فشل التسليم',
};
const STATUS_CLASS: Record<string, string> = {
  PENDING: 'text-text-lo border-text-lo/30', ASSIGNED: 'text-info border-info/30',
  IN_TRANSIT: 'text-amber border-amber/30', DELIVERED: 'text-success border-success/30',
  FAILED: 'text-danger border-danger/30',
};

export default function DeliveryPage() {
  const [tab, setTab] = useState<'deliveries' | 'drivers'>('deliveries');
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [assignDriverId, setAssignDriverId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [failReason, setFailReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([api.listDeliveries(), api.listDrivers(), api.listSalesOrders(), api.listWarehouses()])
      .then(([d, dr, so, w]) => { setDeliveries(d); setDrivers(dr); setSalesOrders(so); setWarehouses(w); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(refresh, [refresh]);

  const selected = deliveries.find((d) => d.id === selectedId);
  const packedOrders = salesOrders.filter((o) => o.status === 'PACKED' && !deliveries.some((d) => d.salesOrder?.id === o.id));

  async function assignDriver() {
    if (!selected || !assignDriverId) return;
    setBusy(true); setError(null);
    try { await api.assignDriverToDelivery(selected.id, assignDriverId); setAssignDriverId(''); refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function startTransit() {
    if (!selected) return;
    setBusy(true); setError(null);
    try { await api.startDeliveryTransit(selected.id); refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function complete() {
    if (!selected || !recipientName.trim()) { setError('أدخل اسم مستلم البضاعة'); return; }
    setBusy(true); setError(null);
    try { await api.completeDelivery(selected.id, recipientName.trim()); setRecipientName(''); refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function fail() {
    if (!selected || !failReason.trim()) { setError('أدخل سبب فشل التسليم'); return; }
    setBusy(true); setError(null);
    try { await api.failDelivery(selected.id, failReason.trim()); setFailReason(''); refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {[['deliveries', 'التوصيلات'], ['drivers', 'السائقون']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as any)}
              className={`px-3 py-1.5 rounded text-[12.5px] border ${tab === id ? 'bg-surface-alt text-text-hi border-border-lite' : 'text-text-lo border-transparent'}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'deliveries' ? (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber text-[12px] font-bold" style={{ color: '#1A1305' }}>
            <Plus size={14} /> توصيل جديد
          </button>
        ) : (
          <button onClick={() => setShowAddDriver(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber text-[12px] font-bold" style={{ color: '#1A1305' }}>
            <UserPlus size={14} /> سائق جديد
          </button>
        )}
      </div>

      {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

      {tab === 'drivers' ? (
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-text-lo">
                {['الاسم', 'الهاتف', 'المركبة', 'الحالة'].map((h) => (
                  <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-lo font-mono">جاري التحميل...</td></tr>}
              {!loading && drivers.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-lo">لا يوجد سائقون بعد</td></tr>}
              {drivers.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-text-hi">{d.name}</td>
                  <td className="px-4 py-2.5 font-mono text-text-lo">{d.phone ?? '—'}</td>
                  <td className="px-4 py-2.5 text-text-mid">{d.vehicleInfo ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10.5px] border ${d.isActive ? 'text-success border-success/30' : 'text-text-lo border-text-lo/30'}`}>
                      {d.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="rounded border border-border bg-surface overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-border text-text-lo">
                    {['العميل', 'السائق', 'المستودع', 'الحالة'].map((h) => (
                      <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-lo font-mono">جاري التحميل...</td></tr>}
                  {!loading && deliveries.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-lo">لا توجد توصيلات بعد</td></tr>}
                  {deliveries.map((d) => (
                    <tr key={d.id} onClick={() => setSelectedId(d.id)}
                      className={`border-b border-border cursor-pointer hover:bg-white/[0.02] ${selectedId === d.id ? 'bg-surface-alt' : ''}`}>
                      <td className="px-4 py-2.5 text-text-mid">{d.salesOrder.customer.name}</td>
                      <td className="px-4 py-2.5 text-text-lo">{d.driver?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-text-lo">{d.warehouse.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10.5px] border ${STATUS_CLASS[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded border border-border bg-surface p-4 h-fit">
            {!selected ? (
              <div className="text-text-lo text-[12.5px] text-center py-10">اختر توصيلاً لعرض التفاصيل</div>
            ) : (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Truck size={14} className="text-amber" />
                  <div className="text-text-hi text-[14px] font-semibold">{selected.salesOrder.customer.name}</div>
                </div>
                <div className="text-text-lo text-[11px] font-mono mb-4">{selected.id}</div>

                <div className="space-y-1.5 mb-4 text-[12px]">
                  <div className="flex justify-between"><span className="text-text-lo">المستودع</span><span className="text-text-mid">{selected.warehouse.name}</span></div>
                  <div className="flex justify-between"><span className="text-text-lo">السائق</span><span className="text-text-mid">{selected.driver?.name ?? 'لم يُعيّن بعد'}</span></div>
                  {selected.address && <div className="flex justify-between"><span className="text-text-lo">العنوان</span><span className="text-text-mid">{selected.address}</span></div>}
                  {selected.recipientName && <div className="flex justify-between"><span className="text-text-lo">المستلم</span><span className="text-success">{selected.recipientName}</span></div>}
                  {selected.failureReason && <div className="flex justify-between"><span className="text-text-lo">سبب الفشل</span><span className="text-danger">{selected.failureReason}</span></div>}
                </div>

                {selected.status === 'PENDING' && (
                  <div className="pt-3 border-t border-border">
                    <label className="block mb-1 text-[12px] text-text-mid">تعيين سائق</label>
                    <div className="flex gap-2">
                      <select value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded bg-surface-alt border border-border text-text-hi text-[12px] outline-none">
                        <option value="">— اختر —</option>
                        {drivers.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <button onClick={assignDriver} disabled={busy} className="px-3 py-1.5 rounded bg-amber text-[11.5px] font-bold disabled:opacity-60" style={{ color: '#1A1305' }}>تعيين</button>
                    </div>
                  </div>
                )}

                {selected.status === 'ASSIGNED' && (
                  <button onClick={startTransit} disabled={busy}
                    className="w-full mt-2 py-2 rounded bg-amber text-[12.5px] font-bold disabled:opacity-60" style={{ color: '#1A1305' }}>
                    بدء الرحلة (يحول الطلب لـ DISPATCHED)
                  </button>
                )}

                {selected.status === 'IN_TRANSIT' && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <div>
                      <label className="block mb-1 text-[12px] text-text-mid">اسم مستلم البضاعة</label>
                      <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                        className="w-full px-2 py-1.5 rounded bg-surface-alt border border-border text-text-hi text-[12px] outline-none" />
                    </div>
                    <button onClick={complete} disabled={busy}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded bg-success text-[12.5px] font-bold text-white disabled:opacity-60">
                      <CheckCircle2 size={14} /> تأكيد التسليم (يحرك المخزون فعلياً)
                    </button>
                    <div>
                      <label className="block mb-1 text-[12px] text-text-mid">أو تسجيل فشل التسليم</label>
                      <input value={failReason} onChange={(e) => setFailReason(e.target.value)} placeholder="مثال: العميل غير متواجد"
                        className="w-full px-2 py-1.5 rounded bg-surface-alt border border-border text-text-hi text-[12px] outline-none" />
                    </div>
                    <button onClick={fail} disabled={busy}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-danger/30 text-danger text-[12.5px] disabled:opacity-60">
                      <XCircle size={14} /> فشل التسليم
                    </button>
                  </div>
                )}

                {selected.status === 'DELIVERED' && (
                  <div className="text-success text-[12.5px] text-center py-2 pt-3 border-t border-border">تم التسليم بنجاح ✓</div>
                )}
                {selected.status === 'FAILED' && (
                  <div className="text-danger text-[12.5px] text-center py-2 pt-3 border-t border-border">فشل التسليم</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateDeliveryModal packedOrders={packedOrders} warehouses={warehouses} onClose={() => setShowCreate(false)} onCreated={refresh} />
      )}
      {showAddDriver && (
        <AddDriverModal onClose={() => setShowAddDriver(false)} onCreated={refresh} />
      )}
    </div>
  );
}
