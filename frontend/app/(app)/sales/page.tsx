'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { CreateOrderModal } from '../../../components/sales/CreateOrderModal';

const STATUS_LABEL: Record<string, string> = {
  QUOTATION: 'عرض سعر', READY: 'جاهز', PICKING: 'تحضير', PACKED: 'معبأ',
  DISPATCHED: 'أُرسل', DELIVERED: 'تم التسليم', INVOICED: 'مُفوتر', CANCELLED: 'ملغى',
};
const STATUS_CLASS: Record<string, string> = {
  QUOTATION: 'text-text-lo border-text-lo/30', READY: 'text-info border-info/30',
  PICKING: 'text-amber border-amber/30', PACKED: 'text-amber border-amber/30',
  DISPATCHED: 'text-info border-info/30', DELIVERED: 'text-success border-success/30',
  INVOICED: 'text-success border-success/30', CANCELLED: 'text-danger border-danger/30',
};
const FLOW = ['QUOTATION', 'READY', 'PICKING', 'PACKED', 'DISPATCHED', 'DELIVERED', 'INVOICED'];

function orderTotal(order: any) {
  return order.items.reduce((sum: number, i: any) => sum + i.quantity * i.unitPrice, 0);
}
function orderMargin(order: any) {
  const revenue = orderTotal(order);
  const cost = order.items.reduce((sum: number, i: any) => sum + i.quantity * i.unitCost, 0);
  return revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
}

export default function SalesPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([api.listSalesOrders(), api.listCustomers(), api.listProducts(), api.listWarehouses()])
      .then(([o, c, p, w]) => { setOrders(o); setCustomers(c); setProducts(p); setWarehouses(w); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const selected = orders.find((o) => o.id === selectedId);

  async function advance(action: 'confirm' | 'pick' | 'pack' | 'dispatch' | 'invoice' | 'cancel') {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'confirm') await api.confirmSalesOrder(selected.id);
      else if (action === 'invoice') await api.invoiceSalesOrder(selected.id);
      else if (action === 'cancel') await api.cancelSalesOrder(selected.id);
      else {
        const map: Record<string, string> = { pick: 'PICKING', pack: 'PACKED', dispatch: 'DISPATCHED' };
        await api.advanceSalesOrder(selected.id, map[action]);
      }
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deliver() {
    if (!selected || !warehouses[0]) return;
    setBusy(true);
    setError(null);
    try {
      await api.deliverSalesOrder(selected.id, warehouses[0].id);
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-text-hi text-[13.5px] font-semibold">طلبات البيع ({orders.length})</div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber text-[12px] font-bold" style={{ color: '#1A1305' }}>
            <Plus size={14} /> طلب جديد
          </button>
        </div>

        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-text-lo">
                {['العميل', 'المنتجات', 'الإجمالي', 'الهامش', 'الحالة'].map((h) => (
                  <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-text-lo font-mono">جاري التحميل...</td></tr>}
              {!loading && orders.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-text-lo">لا توجد طلبات بعد</td></tr>}
              {orders.map((o) => (
                <tr key={o.id} onClick={() => setSelectedId(o.id)}
                  className={`border-b border-border cursor-pointer hover:bg-white/[0.02] ${selectedId === o.id ? 'bg-surface-alt' : ''}`}>
                  <td className="px-4 py-2.5 text-text-mid">{o.customer.name}</td>
                  <td className="px-4 py-2.5 font-mono text-text-lo">{o.items.length}</td>
                  <td className="px-4 py-2.5 font-mono text-text-hi">{orderTotal(o).toLocaleString()} MAD</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: orderMargin(o) > 15 ? '#4FAE7C' : '#F0A93B' }}>
                    {orderMargin(o).toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10.5px] border ${STATUS_CLASS[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded border border-border bg-surface p-4 h-fit">
        {!selected ? (
          <div className="text-text-lo text-[12.5px] text-center py-10">اختر طلباً لعرض التفاصيل</div>
        ) : (
          <div>
            <div className="text-text-hi text-[14px] font-semibold">{selected.customer.name}</div>
            <div className="text-text-lo text-[11px] font-mono mt-0.5">{selected.id}</div>

            <div className="mt-4 space-y-2 text-[12.5px]">
              <div className="flex justify-between"><span className="text-text-lo">الإجمالي</span><span className="font-mono text-text-hi">{orderTotal(selected).toLocaleString()} MAD</span></div>
              <div className="flex justify-between"><span className="text-text-lo">الهامش</span><span className="font-mono text-success">{orderMargin(selected).toFixed(1)}%</span></div>
            </div>

            <div className="mt-4 pt-3 border-t border-border">
              {FLOW.map((step, i) => {
                const idx = FLOW.indexOf(selected.status);
                const done = selected.status !== 'CANCELLED' && i <= idx;
                return (
                  <div key={step} className="flex items-center gap-2 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: done ? '#F0A93B' : '#2A2F35' }} />
                    <span className="text-[11.5px]" style={{ color: done ? '#ECEEF0' : '#7C8492' }}>{STATUS_LABEL[step]}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-border flex flex-col gap-2">
              {selected.status === 'QUOTATION' && (
                <button disabled={busy} onClick={() => advance('confirm')} className="py-2 rounded bg-amber text-[12.5px] font-bold" style={{ color: '#1A1305' }}>تأكيد الطلب</button>
              )}
              {selected.status === 'READY' && (
                <button disabled={busy} onClick={() => advance('pick')} className="py-2 rounded bg-amber text-[12.5px] font-bold" style={{ color: '#1A1305' }}>بدء التحضير</button>
              )}
              {selected.status === 'PICKING' && (
                <button disabled={busy} onClick={() => advance('pack')} className="py-2 rounded bg-amber text-[12.5px] font-bold" style={{ color: '#1A1305' }}>تعبئة</button>
              )}
              {selected.status === 'PACKED' && (
                <button disabled={busy} onClick={deliver} className="py-2 rounded bg-amber text-[12.5px] font-bold" style={{ color: '#1A1305' }}>تسليم (يحرك المخزون فعلياً)</button>
              )}
              {selected.status === 'DELIVERED' && (
                <button disabled={busy} onClick={() => advance('invoice')} className="py-2 rounded bg-amber text-[12.5px] font-bold" style={{ color: '#1A1305' }}>إصدار فاتورة</button>
              )}
              {['QUOTATION', 'READY'].includes(selected.status) && (
                <button disabled={busy} onClick={() => advance('cancel')} className="py-2 rounded border border-danger/30 text-danger text-[12.5px]">إلغاء الطلب</button>
              )}
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <CreateOrderModal customers={customers} products={products} onClose={() => setShowAdd(false)} onCreated={refresh} />
      )}
    </div>
  );
}
