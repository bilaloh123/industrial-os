'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';

export function AddProductModal({
  categories,
  brands,
  onClose,
  onCreated,
}: {
  categories: any[];
  brands: any[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [internalRef, setInternalRef] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [attributeDefs, setAttributeDefs] = useState<any[]>([]);
  const [attrValues, setAttrValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Dynamic Attribute Engine (PHASE 10): the form fields shown below
  // change automatically depending on the selected category.
  useEffect(() => {
    if (!categoryId) { setAttributeDefs([]); return; }
    api.listAttributeDefinitions(categoryId).then(setAttributeDefs).catch(() => setAttributeDefs([]));
    setAttrValues({});
  }, [categoryId]);

  async function submit() {
    if (!internalRef.trim() || !name.trim()) {
      setError('المرجع الداخلي واسم المنتج إلزاميان');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createProduct({
        internalRef,
        name,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        sellingPrice: sellingPrice ? Number(sellingPrice) : undefined,
        attributeValues: Object.entries(attrValues)
          .filter(([, v]) => v.trim())
          .map(([attributeDefinitionId, value]) => ({ attributeDefinitionId, value })),
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(10,12,14,0.7)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[85vh] overflow-y-auto p-6 rounded bg-surface border border-border-lite">
        <div className="text-text-hi text-[14px] font-semibold mb-4">منتج جديد</div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block mb-1 text-[12px] text-text-mid">المرجع الداخلي</label>
            <input value={internalRef} onChange={(e) => setInternalRef(e.target.value)}
              className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi font-mono text-[13px] outline-none" dir="ltr" />
          </div>
          <div>
            <label className="block mb-1 text-[12px] text-text-mid">سعر البيع (MAD)</label>
            <input value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} type="number"
              className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi font-mono text-[13px] outline-none" />
          </div>
        </div>

        <div className="mb-3">
          <label className="block mb-1 text-[12px] text-text-mid">اسم المنتج</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none" />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block mb-1 text-[12px] text-text-mid">الفئة</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none">
              <option value="">— بدون —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block mb-1 text-[12px] text-text-mid">الماركة</label>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
              className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none">
              <option value="">— بدون —</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        {attributeDefs.length > 0 && (
          <div className="mb-4 p-3 rounded bg-surface-alt border border-border">
            <div className="text-text-lo text-[11px] font-mono mb-2">الخصائص التقنية — {categories.find((c) => c.id === categoryId)?.name}</div>
            <div className="grid grid-cols-2 gap-2">
              {attributeDefs.map((a) => (
                <div key={a.id}>
                  <label className="block mb-1 text-[11.5px] text-text-mid">{a.label}{a.unit ? ` (${a.unit})` : ''}</label>
                  <input
                    value={attrValues[a.id] ?? ''}
                    onChange={(e) => setAttrValues({ ...attrValues, [a.id]: e.target.value })}
                    className="w-full px-2 py-1.5 rounded bg-bg border border-border text-text-hi font-mono text-[12.5px] outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border border-border text-text-mid text-[13px]">إلغاء</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded bg-amber font-bold text-[13px] disabled:opacity-60" style={{ color: '#1A1305' }}>
            {saving ? 'جاري الحفظ...' : 'إنشاء المنتج'}
          </button>
        </div>
      </div>
    </div>
  );
}
