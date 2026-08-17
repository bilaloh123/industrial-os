'use client';

import { useEffect, useState, useCallback } from 'react';
import { Download } from 'lucide-react';
import { api } from '../../../lib/api-client';

const STATUS_LABEL: Record<string, string> = {
  UNPAID: 'غير مدفوعة', PARTIALLY_PAID: 'مدفوعة جزئياً', PAID: 'مدفوعة', OVERDUE: 'متأخرة', CANCELLED: 'ملغاة',
};
const STATUS_CLASS: Record<string, string> = {
  UNPAID: 'text-danger border-danger/30', PARTIALLY_PAID: 'text-amber border-amber/30',
  PAID: 'text-success border-success/30', OVERDUE: 'text-danger border-danger/30',
  CANCELLED: 'text-text-lo border-text-lo/30',
};

function fmt(n: number) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

export default function FinancePage() {
  const [tab, setTab] = useState<'invoices' | 'bills'>('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([api.listInvoices(), api.listBills(), api.getFinanceSummary()])
      .then(([inv, b, sum]) => { setInvoices(inv); setBills(b); setSummary(sum); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => setSelectedId(null), [tab]);

  const list = tab === 'invoices' ? invoices : bills;
  const selected = list.find((i) => i.id === selectedId);
  const payments = tab === 'invoices' ? selected?.payments : selected?.supplierPayments;
  const paidOnSelected = selected ? (payments ?? []).reduce((s: number, p: any) => s + p.amount, 0) : 0;
  const counterparty = tab === 'invoices' ? selected?.customer?.name : selected?.supplier?.name;
  const number = tab === 'invoices' ? selected?.invoiceNumber : selected?.billNumber;

  async function pay() {
    if (!selected || !amount) return;
    setBusy(true); setError(null);
    try {
      if (tab === 'invoices') await api.recordPayment(selected.id, Number(amount));
      else await api.recordSupplierPayment(selected.id, Number(amount));
      setAmount('');
      refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function downloadPdf() {
    if (!selected || tab !== 'invoices') return;
    setBusy(true); setError(null);
    try {
      await api.downloadInvoicePdf(selected.id);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'رقم المعاملات', value: `${fmt(summary.revenue)} MAD` },
            { label: 'الهامش الإجمالي', value: `${summary.marginPercent.toFixed(1)}%` },
            { label: 'الذمم المدينة (عملاء)', value: `${fmt(summary.receivables)} MAD` },
            { label: 'الذمم الدائنة (موردون)', value: `${fmt(summary.payables)} MAD`, danger: summary.payables > 0 },
          ].map((k) => (
            <div key={k.label} className="p-4 rounded bg-surface border border-border">
              <div className="text-text-lo text-[11.5px]">{k.label}</div>
              <div className={`font-mono text-[20px] font-semibold mt-1.5 ${k.danger ? 'text-amber' : 'text-text-hi'}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 mb-4">
        {[['invoices', 'فواتير العملاء'], ['bills', 'فواتير الموردين']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={`px-3 py-1.5 rounded text-[12.5px] border ${tab === id ? 'bg-surface-alt text-text-hi border-border-lite' : 'text-text-lo border-transparent'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}
          <div className="rounded border border-border bg-surface overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-text-lo">
                  {['الرقم', tab === 'invoices' ? 'العميل' : 'المورد', 'الإجمالي', 'الحالة'].map((h) => (
                    <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="px-4 py-6 text-center text-text-lo font-mono">جاري التحميل...</td></tr>}
                {!loading && list.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-text-lo">
                    {tab === 'invoices' ? 'لا توجد فواتير بعد — أصدر فاتورة من طلب بيع مُسلَّم' : 'لا توجد فواتير موردين بعد — تُصدر تلقائياً عند اكتمال استلام طلب شراء'}
                  </td></tr>
                )}
                {list.map((item) => (
                  <tr key={item.id} onClick={() => setSelectedId(item.id)}
                    className={`border-b border-border cursor-pointer hover:bg-white/[0.02] ${selectedId === item.id ? 'bg-surface-alt' : ''}`}>
                    <td className="px-4 py-2.5 font-mono text-text-hi">{tab === 'invoices' ? item.invoiceNumber : item.billNumber}</td>
                    <td className="px-4 py-2.5 text-text-mid">{tab === 'invoices' ? item.customer.name : item.supplier.name}</td>
                    <td className="px-4 py-2.5 font-mono text-text-hi">{fmt(item.totalAmount)} MAD</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10.5px] border ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded border border-border bg-surface p-4 h-fit">
          {!selected ? (
            <div className="text-text-lo text-[12.5px] text-center py-10">اختر فاتورة لتسجيل دفعة</div>
          ) : (
            <div>
              <div className="text-text-hi text-[14px] font-semibold">{number}</div>
              <div className="text-text-lo text-[11px] mt-0.5">{counterparty}</div>

              <div className="mt-4 space-y-1.5 text-[12.5px]">
                <div className="flex justify-between"><span className="text-text-lo">الإجمالي</span><span className="font-mono text-text-hi">{fmt(selected.totalAmount)} MAD</span></div>
                <div className="flex justify-between"><span className="text-text-lo">المدفوع</span><span className="font-mono text-success">{fmt(paidOnSelected)} MAD</span></div>
                <div className="flex justify-between"><span className="text-text-lo">المتبقي</span><span className="font-mono text-amber">{fmt(selected.totalAmount - paidOnSelected)} MAD</span></div>
              </div>

              {tab === 'invoices' && (
                <button onClick={downloadPdf} disabled={busy}
                  className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 rounded border border-border text-text-mid text-[12px] disabled:opacity-50">
                  <Download size={13} /> تحميل PDF
                </button>
              )}

              {selected.status !== 'PAID' && selected.status !== 'CANCELLED' && (
                <div className="mt-4 pt-3 border-t border-border">
                  <label className="block mb-1 text-[12px] text-text-mid">تسجيل دفعة</label>
                  <div className="flex gap-2">
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                      className="flex-1 px-3 py-2 rounded bg-surface-alt border border-border text-text-hi font-mono text-[13px] outline-none" />
                    <button onClick={pay} disabled={busy} className="px-3 py-2 rounded bg-amber text-[12.5px] font-bold" style={{ color: '#1A1305' }}>
                      دفع
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
