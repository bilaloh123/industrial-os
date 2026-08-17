'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [financeSummary, setFinanceSummary] = useState<any>(null);
  const [stockSummary, setStockSummary] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getFinanceSummary(), api.getStockSummary()])
      .then(([f, s]) => { setFinanceSummary(f); setStockSummary(s); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const criticalStock = stockSummary.filter((s) => s.health === 'RED' || s.health === 'BLACK');

  return (
    <div>
      {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}
      {loading && <div className="text-text-lo text-[12.5px] font-mono">جاري تحميل المؤشرات من API الحقيقي...</div>}

      {!loading && financeSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'رقم المعاملات', value: `${fmt(financeSummary.revenue)} MAD` },
            { label: 'الهامش الإجمالي', value: `${financeSummary.marginPercent.toFixed(1)}%` },
            { label: 'الذمم المدينة', value: `${fmt(financeSummary.receivables)} MAD` },
            { label: 'الذمم الدائنة', value: `${fmt(financeSummary.payables)} MAD` },
          ].map((k) => (
            <div key={k.label} className="p-4 rounded bg-surface border border-border">
              <div className="text-text-lo text-[11.5px]">{k.label}</div>
              <div className="font-mono text-[22px] font-semibold mt-1.5 text-text-hi">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && criticalStock.length > 0 && (
        <div className="rounded border border-border bg-surface p-4 mb-5">
          <div className="text-text-hi text-[13.5px] font-semibold mb-2">تنبيهات المخزون</div>
          <div className="space-y-1.5">
            {criticalStock.slice(0, 5).map((s) => (
              <div key={s.productId} className="flex justify-between text-[12.5px]">
                <span className="text-text-mid">{s.internalRef} — {s.name}</span>
                <span className={s.health === 'BLACK' ? 'text-text-lo' : 'text-danger'}>
                  {s.onHand} وحدة {s.health === 'BLACK' ? '(نفد)' : '(حرج)'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-6 rounded border border-dashed border-border text-center">
        <div className="text-text-hi text-[14px] font-semibold">رسوم بيانية إضافية (اتجاهات المبيعات، أفضل العملاء/الموردين...)</div>
        <div className="text-text-lo text-[12.5px] font-mono mt-1">
          سيُبنى محتوى Dashboard الموسّع فمراحل لاحقة — الأرقام أعلاه حقيقية بالفعل من /api/finance/summary و /api/stock/summary.
        </div>
        <div className="text-text-lo text-[11px] mt-3">{user?.roles?.[0]}</div>
      </div>
    </div>
  );
}
