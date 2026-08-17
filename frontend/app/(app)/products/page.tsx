'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Plus, Archive, Layers, Upload, Download } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { AddProductModal } from '../../../components/products/AddProductModal';
import { ManageVariantsModal } from '../../../components/products/ManageVariantsModal';
import { ImportProductsModal } from '../../../components/products/ImportProductsModal';

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [attributeDefs, setAttributeDefs] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [variantsFor, setVariantsFor] = useState<any | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([api.listProducts(), api.listCategories(), api.listBrands(), api.listAttributeDefinitions()])
      .then(([p, c, b, a]) => { setProducts(p); setCategories(c); setBrands(b); setAttributeDefs(a); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  // Smart Technical Search (PHASE 11) — debounced live search against
  // the real backend endpoint that tokenizes "roulement 25 52" etc.
  // Also matches variant SKUs/attribute values (PHASE 9).
  useEffect(() => {
    if (!q.trim()) return;
    setSearching(true);
    const handle = setTimeout(() => {
      api.searchProducts(q)
        .then(setProducts)
        .catch((e) => setError(e.message))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    if (!q.trim()) refresh();
  }, [q, refresh]);

  async function archive(id: string) {
    if (!confirm('أرشفة هذا المنتج؟')) return;
    await api.archiveProduct(id).catch((e) => setError(e.message));
    refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-surface border border-border flex-1">
          <Search size={15} className="text-text-lo" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="roulement 25 52 · courroie 17mm 1250 · flexible 1/2 250 bar"
            className="flex-1 bg-transparent outline-none text-text-hi font-mono text-[12.5px]"
            dir="ltr"
          />
          {searching && <span className="text-text-lo text-[10.5px] font-mono">...</span>}
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded border border-border text-text-mid text-[12.5px] whitespace-nowrap"
        >
          <Upload size={15} /> استيراد Excel
        </button>
        <button
          onClick={() => api.exportProductsExcel().catch((e) => setError(e.message))}
          className="flex items-center gap-1.5 px-3 py-2 rounded border border-border text-text-mid text-[12.5px] whitespace-nowrap"
        >
          <Download size={15} /> تصدير Excel
        </button>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded bg-amber text-[12.5px] font-bold whitespace-nowrap"
          style={{ color: '#1A1305' }}
        >
          <Plus size={15} /> منتج جديد
        </button>
      </div>

      {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

      <div className="rounded border border-border bg-surface overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-text-lo">
              {['المرجع', 'المنتج', 'الفئة', 'الماركة', 'الخصائص', 'السعر', 'التركيبات', ''].map((h) => (
                <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-text-lo font-mono">جاري التحميل...</td></tr>
            )}
            {!loading && products.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-text-lo">لا توجد منتجات</td></tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="border-b border-border hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-mono text-text-hi">{p.internalRef}</td>
                <td className="px-4 py-2.5 text-text-mid">{p.name}</td>
                <td className="px-4 py-2.5 text-text-lo">{p.category?.name ?? '—'}</td>
                <td className="px-4 py-2.5 text-text-lo">{p.brand?.name ?? '—'}</td>
                <td className="px-4 py-2.5 font-mono text-text-lo text-[11px]">
                  {(p.attributeValues ?? [])
                    .map((av: any) => `${av.attributeDefinition.label}: ${av.value}${av.attributeDefinition.unit ?? ''}`)
                    .join(' · ') || '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-text-hi">{p.sellingPrice ? `${p.sellingPrice} MAD` : '—'}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => setVariantsFor(p)} className="flex items-center gap-1 text-text-lo hover:text-amber text-[11.5px]">
                    <Layers size={13} /> {p.variants?.length ? `${p.variants.length} تركيبة` : 'إدارة'}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <button onClick={() => archive(p.id)} title="أرشفة" className="text-text-lo hover:text-danger">
                    <Archive size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddProductModal
          categories={categories}
          brands={brands}
          onClose={() => setShowAdd(false)}
          onCreated={refresh}
        />
      )}

      {variantsFor && (
        <ManageVariantsModal
          product={variantsFor}
          attributeDefs={attributeDefs}
          onClose={() => { setVariantsFor(null); refresh(); }}
        />
      )}

      {showImport && (
        <ImportProductsModal onClose={() => setShowImport(false)} onImported={refresh} />
      )}
    </div>
  );
}
