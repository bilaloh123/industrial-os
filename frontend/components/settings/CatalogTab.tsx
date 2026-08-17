'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Tag, Layers, SlidersHorizontal } from 'lucide-react';
import { api } from '../../lib/api-client';

const ATTR_TYPE_LABEL: Record<string, string> = { STRING: 'نصي', NUMBER: 'رقمي', ENUM: 'قائمة اختيار' };

export function CatalogTab() {
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [attributes, setAttributes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // forms
  const [newCategory, setNewCategory] = useState('');
  const [newCategoryParent, setNewCategoryParent] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [attrLabel, setAttrLabel] = useState('');
  const [attrKey, setAttrKey] = useState('');
  const [attrType, setAttrType] = useState<'STRING' | 'NUMBER' | 'ENUM'>('STRING');
  const [attrUnit, setAttrUnit] = useState('');
  const [attrCategoryId, setAttrCategoryId] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([api.listCategories(), api.listBrands(), api.listAttributeDefinitions()])
      .then(([c, b, a]) => { setCategories(c); setBrands(b); setAttributes(a); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(refresh, [refresh]);

  async function addCategory() {
    if (!newCategory.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.createCategory({ name: newCategory.trim(), parentId: newCategoryParent || undefined });
      setNewCategory(''); setNewCategoryParent('');
      refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function addBrand() {
    if (!newBrand.trim()) return;
    setBusy(true); setError(null);
    try {
      await api.createBrand({ name: newBrand.trim() });
      setNewBrand('');
      refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function addAttribute() {
    if (!attrLabel.trim() || !attrKey.trim()) { setError('أدخل المفتاح والاسم المعروض للخاصية'); return; }
    setBusy(true); setError(null);
    try {
      await api.createAttributeDefinition({
        key: attrKey.trim(),
        label: attrLabel.trim(),
        type: attrType,
        unit: attrUnit.trim() || undefined,
        categoryId: attrCategoryId || undefined,
      });
      setAttrLabel(''); setAttrKey(''); setAttrUnit(''); setAttrCategoryId('');
      refresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  if (loading) return <div className="text-text-lo text-[12.5px] font-mono">جاري التحميل...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {error && <div className="text-danger text-[12.5px]">{error}</div>}

      {/* Brands */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Tag size={14} className="text-amber" />
          <div className="text-text-hi text-[13.5px] font-semibold">الماركات ({brands.length})</div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {brands.map((b) => (
            <span key={b.id} className="px-2 py-1 rounded text-[11.5px] bg-surface-alt border border-border text-text-mid">{b.name}</span>
          ))}
          {brands.length === 0 && <span className="text-text-lo text-[12px]">لا توجد ماركات بعد</span>}
        </div>
        <div className="flex gap-2">
          <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="اسم الماركة الجديدة"
            className="flex-1 px-3 py-1.5 rounded bg-surface-alt border border-border text-text-hi text-[12.5px] outline-none" />
          <button onClick={addBrand} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded bg-amber text-[12px] font-bold disabled:opacity-60" style={{ color: '#1A1305' }}>
            <Plus size={13} /> إضافة
          </button>
        </div>
      </div>

      {/* Categories */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Layers size={14} className="text-amber" />
          <div className="text-text-hi text-[13.5px] font-semibold">الفئات ({categories.length})</div>
        </div>
        <div className="rounded border border-border bg-surface overflow-hidden mb-2">
          {categories.length === 0 && <div className="px-3 py-3 text-center text-text-lo text-[12px]">لا توجد فئات بعد</div>}
          {categories.map((c) => (
            <div key={c.id} className="px-3 py-2 border-b border-border last:border-0 text-[12.5px] text-text-mid">
              {c.name}
              {c.children?.length > 0 && (
                <span className="text-text-lo text-[11px] font-mono"> — {c.children.length} فئة فرعية</span>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="اسم الفئة الجديدة"
            className="flex-1 px-3 py-1.5 rounded bg-surface-alt border border-border text-text-hi text-[12.5px] outline-none" />
          <select value={newCategoryParent} onChange={(e) => setNewCategoryParent(e.target.value)}
            className="px-2 py-1.5 rounded bg-surface-alt border border-border text-text-hi text-[12px] outline-none">
            <option value="">فئة رئيسية</option>
            {categories.map((c) => <option key={c.id} value={c.id}>فرعية من: {c.name}</option>)}
          </select>
          <button onClick={addCategory} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 rounded bg-amber text-[12px] font-bold disabled:opacity-60" style={{ color: '#1A1305' }}>
            <Plus size={13} /> إضافة
          </button>
        </div>
      </div>

      {/* Dynamic Attributes */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <SlidersHorizontal size={14} className="text-amber" />
          <div className="text-text-hi text-[13.5px] font-semibold">الخصائص التقنية الديناميكية ({attributes.length})</div>
        </div>
        <div className="text-text-lo text-[11.5px] mb-2">
          هاذي الخصائص كتبان تلقائياً كحقول فنموذج إضافة منتج، حسب الفئة المختارة (محرك الخصائص الديناميكي — PHASE 10)
        </div>
        <div className="rounded border border-border bg-surface overflow-hidden mb-2">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-text-lo">
                {['الاسم المعروض', 'المفتاح', 'النوع', 'الوحدة', 'الفئة'].map((h) => (
                  <th key={h} className="text-right px-3 py-2 font-normal text-[10.5px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attributes.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-3 text-center text-text-lo">لا توجد خصائص بعد</td></tr>
              )}
              {attributes.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-text-hi">{a.label}</td>
                  <td className="px-3 py-2 font-mono text-text-lo">{a.key}</td>
                  <td className="px-3 py-2 text-text-mid">{ATTR_TYPE_LABEL[a.type]}</td>
                  <td className="px-3 py-2 font-mono text-text-lo">{a.unit ?? '—'}</td>
                  <td className="px-3 py-2 text-text-lo">{categories.find((c) => c.id === a.categoryId)?.name ?? 'عامة'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-3 rounded bg-surface-alt border border-border">
          <div className="text-text-lo text-[11px] font-mono mb-2">إضافة خاصية جديدة</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={attrLabel} onChange={(e) => setAttrLabel(e.target.value)} placeholder="الاسم المعروض (مثال: القطر الداخلي)"
              className="px-2 py-1.5 rounded bg-bg border border-border text-text-hi text-[12px] outline-none" />
            <input value={attrKey} onChange={(e) => setAttrKey(e.target.value.replace(/\s+/g, '_'))} placeholder="المفتاح (مثال: inner_diameter)"
              className="px-2 py-1.5 rounded bg-bg border border-border text-text-hi font-mono text-[12px] outline-none" dir="ltr" />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <select value={attrType} onChange={(e) => setAttrType(e.target.value as any)}
              className="px-2 py-1.5 rounded bg-bg border border-border text-text-hi text-[12px] outline-none">
              <option value="STRING">نصي</option>
              <option value="NUMBER">رقمي</option>
              <option value="ENUM">قائمة اختيار</option>
            </select>
            <input value={attrUnit} onChange={(e) => setAttrUnit(e.target.value)} placeholder="الوحدة (mm, bar...)"
              className="px-2 py-1.5 rounded bg-bg border border-border text-text-hi font-mono text-[12px] outline-none" />
            <select value={attrCategoryId} onChange={(e) => setAttrCategoryId(e.target.value)}
              className="px-2 py-1.5 rounded bg-bg border border-border text-text-hi text-[12px] outline-none">
              <option value="">عامة (كل الفئات)</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={addAttribute} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber text-[11.5px] font-bold disabled:opacity-60" style={{ color: '#1A1305' }}>
            <Plus size={13} /> {busy ? 'جاري الإضافة...' : 'إضافة خاصية'}
          </button>
        </div>
      </div>
    </div>
  );
}
