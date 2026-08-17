'use client';

import { useState } from 'react';
import { ShieldCheck, ShieldOff, QrCode } from 'lucide-react';
import { api } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

export function SecurityTab() {
  const { user } = useAuth();
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null); // null = unknown until we check /me again
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.setupMfa();
      setSetupData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    if (confirmCode.trim().length < 6) { setError('أدخل رمز التحقق المكوّن من 6 أرقام'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.enableMfa(confirmCode.trim());
      setMfaEnabled(true);
      setSetupData(null);
      setConfirmCode('');
      setSuccess('تم تفعيل التحقق بخطوتين بنجاح — سيُطلب منك الرمز فكل تسجيل دخول جديد.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable() {
    if (!disablePassword || disableCode.trim().length < 6) {
      setError('أدخل كلمة المرور ورمز التحقق معاً');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.disableMfa(disablePassword, disableCode.trim());
      setMfaEnabled(false);
      setShowDisable(false);
      setDisablePassword('');
      setDisableCode('');
      setSuccess('تم تعطيل التحقق بخطوتين.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const currentlyEnabled = mfaEnabled; // null until the user takes an action this session

  return (
    <div className="max-w-lg">
      <div className="p-4 rounded bg-surface border border-border mb-4">
        <div className="flex items-center gap-2 mb-1">
          {currentlyEnabled ? <ShieldCheck size={16} className="text-success" /> : <ShieldOff size={16} className="text-text-lo" />}
          <div className="text-text-hi text-[13.5px] font-semibold">التحقق بخطوتين (TOTP)</div>
        </div>
        <div className="text-text-lo text-[12px]">
          حماية إضافية على حساب <span className="font-mono">{user?.sub}</span> — رمز مؤقت من تطبيق مصادقة
          (Google Authenticator، Authy، أو ما شابه) بجانب كلمة المرور.
        </div>
      </div>

      {error && <div className="mb-3 text-danger text-[12.5px]">{error}</div>}
      {success && <div className="mb-3 text-success text-[12.5px]">{success}</div>}

      {!setupData && !showDisable && (
        <div className="flex gap-2">
          <button onClick={startSetup} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-amber text-[12.5px] font-bold disabled:opacity-60" style={{ color: '#1A1305' }}>
            <QrCode size={14} /> إعداد التحقق بخطوتين
          </button>
          <button onClick={() => setShowDisable(true)}
            className="px-3 py-2 rounded border border-danger/30 text-danger text-[12.5px]">
            تعطيل التحقق بخطوتين
          </button>
        </div>
      )}

      {setupData && (
        <div className="p-4 rounded bg-surface-alt border border-border">
          <div className="text-text-hi text-[13px] font-semibold mb-2">1. امسح الرمز بتطبيق المصادقة</div>
          <img src={setupData.qrCodeDataUrl} alt="QR Code" className="w-40 h-40 rounded bg-white p-2 mb-3" />
          <div className="text-text-lo text-[11px] mb-3">
            أو أدخل هذا الرمز يدوياً: <span className="font-mono text-text-hi">{setupData.secret}</span>
          </div>

          <div className="text-text-hi text-[13px] font-semibold mb-2">2. أدخل الرمز المعروض فالتطبيق للتأكيد</div>
          <input value={confirmCode} onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000" inputMode="numeric"
            className="w-full px-3 py-2 mb-3 rounded bg-bg border border-border text-text-hi font-mono text-[18px] tracking-[6px] text-center outline-none" />

          <div className="flex gap-2">
            <button onClick={() => { setSetupData(null); setConfirmCode(''); }} className="flex-1 py-2 rounded border border-border text-text-mid text-[12.5px]">إلغاء</button>
            <button onClick={confirmEnable} disabled={busy}
              className="flex-1 py-2 rounded bg-amber font-bold text-[12.5px] disabled:opacity-60" style={{ color: '#1A1305' }}>
              {busy ? 'جاري التفعيل...' : 'تفعيل'}
            </button>
          </div>
        </div>
      )}

      {showDisable && (
        <div className="p-4 rounded bg-surface-alt border border-danger/30">
          <div className="text-text-hi text-[13px] font-semibold mb-2">تعطيل التحقق بخطوتين</div>
          <div className="text-text-lo text-[11.5px] mb-3">يتطلب كلمة المرور الحالية + رمز تحقق صحيح معاً — لا يكفي عامل واحد.</div>
          <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)}
            placeholder="كلمة المرور الحالية"
            className="w-full px-3 py-2 mb-2 rounded bg-bg border border-border text-text-hi text-[13px] outline-none" />
          <input value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="رمز التحقق (6 أرقام)" inputMode="numeric"
            className="w-full px-3 py-2 mb-3 rounded bg-bg border border-border text-text-hi font-mono text-[13px] outline-none" />
          <div className="flex gap-2">
            <button onClick={() => setShowDisable(false)} className="flex-1 py-2 rounded border border-border text-text-mid text-[12.5px]">إلغاء</button>
            <button onClick={confirmDisable} disabled={busy}
              className="flex-1 py-2 rounded bg-danger font-bold text-[12.5px] disabled:opacity-60" style={{ color: '#fff' }}>
              {busy ? 'جاري التعطيل...' : 'تعطيل'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
