'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';

const FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'اسم الشركة' },
  { key: 'address', label: 'العنوان' },
  { key: 'ice', label: 'ICE' },
  { key: 'ifNumber', label: 'IF' },
  { key: 'rc', label: 'RC' },
  { key: 'tp', label: 'TP' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'email', label: 'البريد الإلكتروني' },
  { key: 'website', label: 'الموقع الإلكتروني' },
];

export function CompanySettingsTab() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getMyCompany()
      .then((c) => setForm(c))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const payload = Object.fromEntries(FIELDS.map((f) => [f.key, form[f.key] ?? '']));
      const updated = await api.updateMyCompany(payload);
      setForm(updated);
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-text-lo text-[12.5px] font-mono">جاري التحميل...</div>;

  return (
    <div className="max-w-xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="block mb-1.5 text-[12px] text-text-mid">{f.label}</label>
            <input
              value={form[f.key] ?? ''}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none"
            />
          </div>
        ))}
      </div>

      {error && <div className="mt-4 text-danger text-[12.5px]">{error}</div>}
      {saved && <div className="mt-4 text-success text-[12.5px]">تم الحفظ بنجاح</div>}

      <button
        onClick={save}
        disabled={saving}
        className="mt-5 px-4 py-2 rounded bg-amber font-bold text-[13px] disabled:opacity-60"
        style={{ color: '#1A1305' }}
      >
        {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
      </button>
    </div>
  );
}
