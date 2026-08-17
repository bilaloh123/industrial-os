'use client';

import { useRef, useState } from 'react';
import { Upload, Download, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../lib/api-client';

type ImportReport = { created: number; skipped: number; errors: { row: number; internalRef: string | null; reason: string }[] };

export function ImportProductsModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submit() {
    if (!file) { setError('اختر ملف Excel أولاً'); return; }
    setUploading(true);
    setError(null);
    try {
      const result = await api.importProductsExcel(file);
      setReport(result);
      onImported();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(10,12,14,0.7)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[85vh] overflow-y-auto p-6 rounded bg-surface border border-border-lite">
        <div className="text-text-hi text-[14px] font-semibold mb-1">استيراد منتجات من Excel</div>
        <div className="text-text-lo text-[11.5px] mb-4">أعمدة الملف المطلوبة: internalRef، name (باقي الأعمدة اختيارية)</div>

        <button onClick={() => api.downloadImportTemplate().catch((e) => setError(e.message))}
          className="flex items-center gap-1.5 mb-4 text-info text-[12px]">
          <Download size={13} /> تحميل نموذج فارغ
        </button>

        <div className="mb-4">
          <input ref={fileInputRef} type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-[12px] text-text-mid" />
        </div>

        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

        {report && (
          <div className="mb-4 p-3 rounded bg-surface-alt border border-border">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-1.5 text-success text-[12.5px]">
                <CheckCircle2 size={14} /> {report.created} تم إنشاؤه
              </div>
              {report.skipped > 0 && (
                <div className="flex items-center gap-1.5 text-danger text-[12.5px]">
                  <XCircle size={14} /> {report.skipped} تم تجاهله
                </div>
              )}
            </div>
            {report.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {report.errors.map((e, i) => (
                  <div key={i} className="text-[11px] text-text-lo font-mono">
                    سطر {e.row} {e.internalRef ? `(${e.internalRef})` : ''}: <span className="text-danger">{e.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border border-border text-text-mid text-[13px]">
            {report ? 'إغلاق' : 'إلغاء'}
          </button>
          {!report && (
            <button onClick={submit} disabled={uploading || !file}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded bg-amber font-bold text-[13px] disabled:opacity-60" style={{ color: '#1A1305' }}>
              <Upload size={14} /> {uploading ? 'جاري الاستيراد...' : 'استيراد'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
