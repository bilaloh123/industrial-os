'use client';

import { useState } from 'react';
import { WifiOff, RefreshCw, AlertTriangle, X, Clock } from 'lucide-react';
import { useNetworkStatus } from '../lib/offline/network-status';

const STATUS_LABEL: Record<string, string> = {
  pending: 'فالانتظار', syncing: 'جاري المزامنة', failed: 'فشلت — تحتاج مراجعة',
};

export function OfflineBanner() {
  const { online, syncing, pending, syncNow, retry, discard } = useNetworkStatus();
  const [open, setOpen] = useState(false);

  if (online && pending.length === 0) return null;

  const failedCount = pending.filter((p) => p.status === 'failed').length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-center gap-2 px-4 py-1.5 text-[11.5px]"
        style={{
          background: !online ? '#3a2410' : failedCount > 0 ? '#3a1414' : '#1f2a1a',
          color: !online ? '#F0A93B' : failedCount > 0 ? '#E1585F' : '#4FAE7C',
        }}
      >
        {!online ? <WifiOff size={13} /> : syncing ? <RefreshCw size={13} className="animate-spin" /> : <Clock size={13} />}
        <span>
          {!online
            ? `غير متصل بالإنترنت — ${pending.length} عملية محفوظة محلياً ستُزامن تلقائياً`
            : syncing
            ? 'جاري مزامنة العمليات المحفوظة...'
            : failedCount > 0
            ? `${failedCount} عملية فشلت فالمزامنة — اضغط للمراجعة`
            : `${pending.length} عملية بانتظار المزامنة`}
        </span>
      </button>

      {open && (
        <div className="absolute top-full inset-x-0 z-40 bg-surface border-b border-border shadow-lg">
          <div className="max-h-64 overflow-y-auto">
            {pending.length === 0 ? (
              <div className="px-4 py-4 text-center text-text-lo text-[12px]">لا توجد عمليات معلّقة</div>
            ) : (
              pending.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <div>
                    <div className="text-text-hi text-[12.5px]">{entry.description}</div>
                    <div className="text-text-lo text-[10.5px] font-mono mt-0.5">
                      {STATUS_LABEL[entry.status]}
                      {entry.error && <span className="text-danger"> — {entry.error}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.status === 'failed' && (
                      <button onClick={() => retry(entry.id)} className="text-info text-[11px]">إعادة محاولة</button>
                    )}
                    <button onClick={() => discard(entry.id)} className="text-text-lo hover:text-danger">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {online && pending.length > 0 && (
            <button onClick={syncNow} disabled={syncing}
              className="w-full py-2 text-[12px] text-amber border-t border-border disabled:opacity-50">
              {syncing ? 'جاري المزامنة...' : 'مزامنة الآن'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
