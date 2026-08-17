'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Download, Scale } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { CreatePurchaseOrderModal } from '../../../components/purchases/CreatePurchaseOrderModal';
import { SupplierComparisonModal } from '../../../components/purchases/SupplierComparisonModal';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودة', ORDERED: 'مطلوب', RECEIVING: 'قيد الاستلام', RECEIVED: 'مستلم', CANCELLED: 'ملغى',
};
const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'text-text-lo border-text-lo/30', ORDERED: 'text-amber border-amber/30',
  RECEIVING: 'text-info border-info/30', RECEIVED: 'text-success border-success/30',
  CANCELLED: 'text-danger border-danger/30',
};

function poTotal(po: any) {
  return po.items.reduce((sum: number, i: any) => sum + i.quantityOrdered * i.unitCost, 0);
}

export default function PurchasesPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([api.listPurchaseOrders(), api.listSuppliers(), api.listProducts(), api.listWarehouses()])
      .then(([o, s, p, w]) => { setOrders(o); setSuppliers(s); setProducts(p); setWarehouses(w); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const selected = orders.find((o) => o.id === selectedId);

  async function confirmOrder() {
    if (!selected) return;
    setBusy(true); setError(null);
    try { await api.confirmPurchaseOrder(selected.id); refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function cancelOrder() {
    if (!selected) return;
    setBusy(true); setError(null);
    try { await api.cancelPurchaseOrder(selected.id); refresh(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function receiveAll() {
    if (!selected || !warehouses[0]) return;
    setBusy(true); setError(null);
    try {
      const lines = selected.items
        .filter((i: any) => i.quantityReceived < i.quantityOrdered)
        .map((i: any) => ({ itemId: i.id, quantity: i.quantityOrdered - i.quantityReceived }));
      await api.receivePurchaseOrder(selected.id, warehouses[0].id, lines);
      refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function downloadPdf() {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      await api.downloadPurchaseOrderPdf(selected.id);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-text-hi text-[13.5px] font-semibold">طلبات الشراء ({orders.length})</div>
          <div className="flex gap-2">
            <button onClick={() => setShowComparison(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-text-mid text-[12px]">
              <Scale size={14} /> مقارنة الموردين
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber text-[12px] font-bold" style={{ color: '#1A1305' }}>
              <Plus size={14} /> طلب جديد
            </button>
          </div>
        </div>

        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-text-lo">
                {['المورد', 'المنتجات', 'الإجمالي', 'الحالة'].map((h) => (
                  <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-lo font-mono">جاري التحميل...</td></tr>}
              {!loading && orders.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-lo">لا توجد طلبات بعد</td></tr>}
              {orders.map((o) => (
                <tr key={o.id} onClick={() => setSelectedId(o.id)}
                  className={`border-b border-border cursor-pointer hover:bg-white/[0.02] ${selectedId === o.id ? 'bg-surface-alt' : ''}`}>
                  <td className="px-4 py-2.5 text-text-mid">{o.supplier.name}</td>
                  <td className="px-4 py-2.5 font-mono text-text-lo">{o.items.length}</td>
                  <td className="px-4 py-2.5 font-mono text-text-hi">{poTotal(o).toLocaleString()} {o.currency}</td>
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
            <div className="text-text-hi text-[14px] font-semibold">{selected.supplier.name}</div>
            <div className="text-text-lo text-[11px] font-mono mt-0.5">{selected.id}</div>

            <div className="mt-4 space-y-1.5">
              {selected.items.map((i: any) => (
                <div key={i.id} className="flex justify-between text-[12px]">
                  <span className="text-text-mid font-mono">{i.product.internalRef}</span>
                  <span className="text-text-lo font-mono">{i.quantityReceived}/{i.quantityOrdered}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-border flex flex-col gap-2">
              <button onClick={downloadPdf} disabled={busy}
                className="flex items-center justify-center gap-1.5 py-2 rounded border border-border text-text-mid text-[12px] disabled:opacity-50">
                <Download size={13} /> تحميل Bon de Commande (PDF)
              </button>
              {selected.status === 'DRAFT' && (
                <>
                  <button disabled={busy} onClick={confirmOrder} className="py-2 rounded bg-amber text-[12.5px] font-bold" style={{ color: '#1A1305' }}>تأكيد الطلب</button>
                  <button disabled={busy} onClick={cancelOrder} className="py-2 rounded border border-danger/30 text-danger text-[12.5px]">إلغاء</button>
                </>
              )}
              {['ORDERED', 'RECEIVING'].includes(selected.status) && (
                <button disabled={busy} onClick={receiveAll} className="py-2 rounded bg-amber text-[12.5px] font-bold" style={{ color: '#1A1305' }}>
                  استلام الكل (يحرك المخزون فعلياً)
                </button>
              )}
              {selected.status === 'RECEIVED' && (
                <div className="text-success text-[12.5px] text-center py-2">تم الاستلام بالكامل</div>
              )}
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <CreatePurchaseOrderModal suppliers={suppliers} products={products} onClose={() => setShowAdd(false)} onCreated={refresh} />
      )}

      {showComparison && (
        <SupplierComparisonModal suppliers={suppliers} products={products} onClose={() => setShowComparison(false)} />
      )}
    </div>
  );
}
