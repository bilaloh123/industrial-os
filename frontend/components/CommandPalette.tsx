'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

type SearchResult = { id: string; title: string; subtitle: string; href: string };

export function CommandPalette({
  open,
  onClose,
  search,
}: {
  open: boolean;
  onClose: () => void;
  /** Pluggable search function — wired to the real /api/search endpoint once
   * the Smart Technical Search module (PHASE 11) exists. */
  search: (query: string) => Promise<SearchResult[]>;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
    else { setQ(''); setResults([]); }
  }, [open]);

  useEffect(() => {
    if (!q) { setResults([]); return; }
    const handle = setTimeout(() => {
      search(q).then(setResults).catch(() => setResults([]));
    }, 150); // debounce
    return () => clearTimeout(handle);
  }, [q, search]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      style={{ background: 'rgba(10,12,14,0.7)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-md shadow-2xl bg-surface border border-border-lite"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={16} className="text-text-lo" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث تقني: مرجع، أبعاد، ماركة، عميل، فاتورة..."
            className="flex-1 bg-transparent outline-none text-text-hi font-mono text-[13px]"
            dir="rtl"
          />
          <kbd className="text-[10px] text-text-lo border border-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {q && results.length === 0 && (
            <div className="px-4 py-6 text-center text-text-lo text-[13px]">لا توجد نتائج</div>
          )}
          {results.map((r) => (
            <a
              key={r.id}
              href={r.href}
              onClick={onClose}
              className="block px-4 py-2.5 hover:bg-white/5 text-right"
            >
              <div className="text-text-hi text-[13.5px]">{r.title}</div>
              <div className="text-text-lo font-mono text-[11.5px]">{r.subtitle}</div>
            </a>
          ))}
          {!q && (
            <div className="px-4 py-3 text-text-lo text-[12px]">
              اكتب اسماً أو مرجعاً للبحث عبر المنتجات، العملاء، الموردين، الطلبات والمستندات
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
