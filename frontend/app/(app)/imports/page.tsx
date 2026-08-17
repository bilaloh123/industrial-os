'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { CreateImportModal } from '../../../components/imports/CreateImportModal';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'مسودة', ORDERED: 'مطلوب', PREPARING: 'تحضير', SHIPPED: 'شُحن',
  AT_PORT: 'بالميناء', CUSTOMS: 'جمارك', RELEASED: 'أُفرج عنه', RECEIVING: 'قيد الاستلام',
  RECEIVED: 'مستلم', CLOSED: 'مغلق', CANCELLED: 'ملغى',
};
const FLOW = ['DRAFT', 'ORDERED', 'PREPARING', 'SHIPPED', 'AT_PORT', 'CUSTOMS', 'RELEASED', 'RECEIVING', 'RECEIVED', 'CLOSED'];

const EXPENSE_TYPES = [
  ['FREIGHT', 'شحن'], ['INSURANCE', 'تأمين'], ['CUSTOMS', 'جمارك'], ['TRANSIT', 'عبور'],
  ['PORT_FEES', 'رسوم الميناء'], ['HANDLING', 'مناولة'], ['BANK_FEES', 'رسوم بنكية'],
  ['DOCUMENTATION', 'وثائق'], ['STORAGE', 'تخزين'], ['OTHER', 'أخرى'],
];

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}

export default function ImportsPage() {
  const [imports, setImports] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [landedCost, setLandedCost] = useState<any[]>([]);
  const [expenseType, setExpenseType] = useState('FREIGHT');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([api.listImports(), api.listPurchaseOrders()])
      .then(([i, p]) => { setImports(i); setPurchaseOrders(p); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const selected = imports.find((i) => i.id === selectedId);

  useEffect(() => {
    if (!selected) { setLandedCost([]); return; }
    api.getLandedCost(selected.id).then(setLandedCost).catch(() => setLandedCost([]));
  }, [selected]);

  async function addExpense() {
    if (!selected || !expenseAmount) return;
    setBusy(true); setError(null);
    try {
      await api.addImportExpense(selected.id, { type: expenseType, amount: Number(expenseAmount) });
      setExpenseAmount('');
      api.getLandedCost(selected.id).then(setLandedCost);
      refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function closeImport() {
    if (!selected) return;
    if (!confirm('إغلاق ملف الاستيراد سيحدّث تكلفة المنتجات بالتكلفة الحقيقية النهائية. متابعة؟')) return;
    setBusy(true); setError(null);
    try {
      await api.closeImport(selected.id);
      refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  const totalExpenses = selected?.expenses.reduce((s: number, e: any) => s + e.amount, 0) ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-text-hi text-[13.5px] font-semibold">ملفات الاستيراد ({imports.length})</div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber text-[12px] font-bold" style={{ color: '#1A1305' }}>
            <Plus size={14} /> ملف جديد
          </button>
        </div>

        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-text-lo">
                {['الرقم', 'المورد', 'بلد المنشأ', 'الحالة'].map((h) => (
                  <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-lo font-mono">جاري التحميل...</td></tr>}
              {!loading && imports.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-lo">لا توجد ملفات استيراد بعد</td></tr>}
              {imports.map((imp) => (
                <tr key={imp.id} onClick={() => setSelectedId(imp.id)}
                  className={`border-b border-border cursor-pointer hover:bg-white/[0.02] ${selectedId === imp.id ? 'bg-surface-alt' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-text-hi">{imp.importNumber}</td>
                  <td className="px-4 py-2.5 text-text-mid">{imp.purchaseOrder.supplier.name}</td>
                  <td className="px-4 py-2.5 text-text-lo">{imp.countryOfOrigin ?? '—'}</td>
                  <td className="px-4 py-2.5 text-info text-[11px]">{STATUS_LABEL[imp.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && landedCost.length > 0 && (
          <div className="mt-4">
            <div className="text-text-hi text-[13.5px] font-semibold mb-2">التكلفة الحقيقية (Landed Cost)</div>
            <div className="rounded border border-border bg-surface overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-border text-text-lo">
                    {['المنتج', 'الكمية', 'تكلفة الشراء', 'حصة التكاليف/وحدة', 'التكلفة الحقيقية', 'الهامش عند البيع'].map((h) => (
                      <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {landedCost.map((l: any) => (
                    <tr key={l.productId} className="border-b border-border">
                      <td className="px-4 py-2.5 font-mono text-text-hi">{l.internalRef}</td>
                      <td className="px-4 py-2.5 font-mono text-text-lo">{l.quantityOrdered}</td>
                      <td className="px-4 py-2.5 font-mono text-text-mid">{fmt(l.purchaseCost)} MAD</td>
                      <td className="px-4 py-2.5 font-mono text-amber">+{fmt(l.allocatedExpensePerUnit)} MAD</td>
                      <td className="px-4 py-2.5 font-mono text-text-hi font-semibold">{fmt(l.trueLandedCost)} MAD</td>
                      <td className="px-4 py-2.5 font-mono text-success">{l.marginPercent != null ? `${l.marginPercent.toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2.5 border-t border-border text-text-lo text-[11px]">
                توزيع التكاليف على المنتجات يتم بالتناسب مع قيمة الشراء (By Value) — PHASE 17
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded border border-border bg-surface p-4 h-fit">
        {!selected ? (
          <div className="text-text-lo text-[12.5px] text-center py-10">اختر ملف استيراد لعرض التفاصيل</div>
        ) : (
          <div>
            <div className="text-text-hi text-[14px] font-semibold">{selected.importNumber}</div>
            <div className="text-text-lo text-[11px] mt-0.5">{selected.purchaseOrder.supplier.name}</div>

            <div className="mt-4 pt-3 border-t border-border">
              {FLOW.map((step, i) => {
                const idx = FLOW.indexOf(selected.status);
                const done = selected.status !== 'CANCELLED' && i <= idx;
                return (
                  <div key={step} className="flex items-center gap-2 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: done ? '#F0A93B' : '#2A2F35' }} />
                    <span className="text-[11px]" style={{ color: done ? '#ECEEF0' : '#7C8492' }}>{STATUS_LABEL[step]}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-text-lo text-[11px] font-mono mb-2">إضافة تكلفة استيراد</div>
              <select value={expenseType} onChange={(e) => setExpenseType(e.target.value)}
                className="w-full px-2 py-1.5 mb-2 rounded bg-surface-alt border border-border text-text-hi text-[12px] outline-none">
                {EXPENSE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div className="flex gap-2">
                <input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="المبلغ"
                  className="flex-1 px-2 py-1.5 rounded bg-surface-alt border border-border text-text-hi font-mono text-[12px] outline-none" />
                <button onClick={addExpense} disabled={busy} className="px-3 py-1.5 rounded bg-amber text-[11.5px] font-bold" style={{ color: '#1A1305' }}>
                  إضافة
                </button>
              </div>
              <div className="mt-2 flex justify-between text-[12px]">
                <span className="text-text-lo">إجمالي التكاليف</span>
                <span className="font-mono text-amber">{fmt(totalExpenses)} MAD</span>
              </div>
            </div>

            {selected.status !== 'CLOSED' && (
              <button onClick={closeImport} disabled={busy}
                className="w-full mt-4 py-2 rounded bg-amber text-[12.5px] font-bold" style={{ color: '#1A1305' }}>
                إغلاق الملف (يحدّث تكلفة المنتجات نهائياً)
              </button>
            )}
          </div>
        )}
      </div>

      {showAdd && (
        <CreateImportModal purchaseOrders={purchaseOrders} onClose={() => setShowAdd(false)} onCreated={refresh} />
      )}
    </div>
  );
}
