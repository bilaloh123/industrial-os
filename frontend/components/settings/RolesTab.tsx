'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';

export function RolesTab() {
  const [roles, setRoles] = useState<any[]>([]);
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listRoles(), api.listPermissionsCatalogue()])
      .then(([r, c]) => {
        setRoles(r);
        setCatalogue(c);
        if (r[0]) selectRole(r[0]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function selectRole(role: any) {
    setSelectedRoleId(role.id);
    setChecked(new Set(role.permissions.map((rp: any) => rp.permission.key)));
  }

  function toggle(key: string) {
    const next = new Set(checked);
    next.has(key) ? next.delete(key) : next.add(key);
    setChecked(next);
  }

  async function save() {
    if (!selectedRoleId) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.setRolePermissions(selectedRoleId, Array.from(checked));
      setRoles((prev) => prev.map((r) => (r.id === selectedRoleId ? updated : r)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-text-lo text-[12.5px] font-mono">جاري التحميل...</div>;

  const grouped = catalogue.reduce<Record<string, any[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});
  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isSuperAdmin = selectedRole?.code === 'SUPER_ADMIN';

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="rounded border border-border bg-surface overflow-hidden h-fit">
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => selectRole(r)}
            className={`w-full text-right px-3 py-2.5 text-[12.5px] border-b border-border last:border-0 ${
              r.id === selectedRoleId ? 'bg-surface-alt text-text-hi' : 'text-text-mid hover:bg-white/5'
            }`}
          >
            {r.name}
            {r.isSystem && <span className="text-text-lo text-[10px] font-mono mr-1.5">SYS</span>}
          </button>
        ))}
      </div>

      <div className="md:col-span-3 rounded border border-border bg-surface p-4">
        {!selectedRole ? (
          <div className="text-text-lo text-[12.5px]">اختر دوراً لعرض صلاحياته</div>
        ) : isSuperAdmin ? (
          <div className="text-text-lo text-[12.5px]">
            SUPER_ADMIN يملك كل الصلاحيات دائماً بشكل غير قابل للتعديل (يتجاوز فحص RBAC فالباك اند).
          </div>
        ) : (
          <>
            {Object.entries(grouped).map(([mod, perms]) => (
              <div key={mod} className="mb-4">
                <div className="text-text-lo text-[11px] font-mono mb-1.5 uppercase">{mod}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {perms.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-[12.5px] text-text-mid cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked.has(p.key)}
                        onChange={() => toggle(p.key)}
                        className="accent-amber"
                      />
                      <span>{p.description ?? p.key}</span>
                      <span className="text-text-lo font-mono text-[10.5px]">{p.key}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded bg-amber font-bold text-[13px] disabled:opacity-60"
              style={{ color: '#1A1305' }}
            >
              {saving ? 'جاري الحفظ...' : 'حفظ الصلاحيات'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
