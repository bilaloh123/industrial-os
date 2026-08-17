'use client';

import { useEffect, useState } from 'react';
import { UserPlus, Lock, Unlock, Trash2 } from 'lucide-react';
import { api } from '../../lib/api-client';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'مدير النظام', DIRECTOR: 'المدير العام', PURCHASING_MANAGER: 'مسؤول المشتريات',
  IMPORT_MANAGER: 'مسؤول الاستيراد', WAREHOUSE_MANAGER: 'مسؤول المخزن', WAREHOUSE_OPERATOR: 'عامل المخزن',
  SALES_MANAGER: 'مدير المبيعات', SALES_REP: 'مندوب المبيعات', ACCOUNTANT: 'المحاسب',
  DELIVERY_MANAGER: 'مسؤول التوصيل', TECHNICIAN: 'تقني', AUDITOR: 'مدقق', READ_ONLY: 'قراءة فقط',
};

export function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  function refresh() {
    setLoading(true);
    api.listUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function toggleActive(u: any) {
    await api.setUserActive(u.id, !u.isActive).catch((e) => setError(e.message));
    refresh();
  }

  async function remove(u: any) {
    if (!confirm(`حذف المستخدم ${u.email}؟`)) return;
    await api.deleteUser(u.id).catch((e) => setError(e.message));
    refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-text-hi text-[13.5px] font-semibold">المستخدمون ({users.length})</div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber text-[12px] font-bold"
          style={{ color: '#1A1305' }}
        >
          <UserPlus size={14} /> دعوة مستخدم
        </button>
      </div>

      {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}

      <div className="rounded border border-border bg-surface overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-text-lo">
              {['البريد الإلكتروني', 'الاسم', 'الدور', 'الحالة', 'آخر دخول', ''].map((h) => (
                <th key={h} className="text-right px-4 py-2.5 font-normal text-[11px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-text-lo font-mono">جاري التحميل...</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-text-lo">لا يوجد مستخدمون بعد</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border hover:bg-white/[0.02]">
                <td className="px-4 py-2.5 font-mono text-text-hi">{u.email}</td>
                <td className="px-4 py-2.5 text-text-mid">{u.firstName} {u.lastName}</td>
                <td className="px-4 py-2.5 text-text-mid">
                  {(u.roles ?? []).map((r: any) => ROLE_LABELS[r.role.code] ?? r.role.name).join('، ') || '—'}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10.5px] border ${u.isActive ? 'text-success border-success/30' : 'text-danger border-danger/30'}`}>
                    {u.isActive ? 'نشط' : 'معطّل'}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-text-lo text-[11px]">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('fr-MA') : 'لم يدخل بعد'}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => toggleActive(u)} title={u.isActive ? 'تعطيل' : 'تفعيل'} className="text-text-lo hover:text-text-hi">
                      {u.isActive ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                    <button onClick={() => remove(u)} title="حذف" className="text-text-lo hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} onCreated={refresh} />}
    </div>
  );
}

function InviteUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!email.trim() || !firstName.trim() || !lastName.trim() || tempPassword.length < 8) {
      setError('عبّي كل الحقول (كلمة المرور 8 خانات على الأقل)');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // roleIds left empty here — role assignment happens from the Roles tab (PHASE 5)
      await api.inviteUser({ email, firstName, lastName, tempPassword, roleIds: [] });
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm p-6 rounded bg-surface border border-border-lite">
        <div className="text-text-hi text-[14px] font-semibold mb-4">دعوة مستخدم جديد</div>

        {[
          { label: 'البريد الإلكتروني', value: email, set: setEmail },
          { label: 'الاسم الشخصي', value: firstName, set: setFirstName },
          { label: 'الاسم العائلي', value: lastName, set: setLastName },
        ].map((f) => (
          <div key={f.label} className="mb-3">
            <label className="block mb-1 text-[12px] text-text-mid">{f.label}</label>
            <input value={f.value} onChange={(e) => f.set(e.target.value)}
              className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi text-[13px] outline-none" />
          </div>
        ))}
        <div className="mb-4">
          <label className="block mb-1 text-[12px] text-text-mid">كلمة مرور مؤقتة</label>
          <input type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)}
            className="w-full px-3 py-2 rounded bg-surface-alt border border-border text-text-hi font-mono text-[13px] outline-none" />
        </div>

        {error && <div className="mb-3 text-danger text-[12px]">{error}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border border-border text-text-mid text-[13px]">إلغاء</button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded bg-amber font-bold text-[13px] disabled:opacity-60" style={{ color: '#1A1305' }}>
            {saving ? 'جاري الإرسال...' : 'إرسال الدعوة'}
          </button>
        </div>
      </div>
    </div>
  );
}
