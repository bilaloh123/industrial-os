'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login, completeMfaLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // MFA second step (PHASE 4 "MFA-ready")
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  async function submit() {
    if (!email.trim() || !password.trim()) {
      setError('أدخل البريد الإلكتروني وكلمة المرور');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result?.mfaRequired) {
        setMfaToken(result.mfaToken); // show the second step instead of navigating
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message ?? 'حدث خطأ أثناء تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  }

  async function submitMfaCode() {
    if (!mfaToken || code.trim().length < 6) {
      setError('أدخل رمز التحقق المكوّن من 6 أرقام');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await completeMfaLogin(mfaToken, code.trim());
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'رمز التحقق غير صحيح');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 text-[11px] font-mono text-text-lo" style={{ letterSpacing: 1 }}>
          <span className="text-amber">●</span> SYS/AUTH · v0.1 · MAD—EUR—USD—GBP
          <span className="flex-1 h-px bg-border" />
        </div>

        <div className="p-8 rounded bg-surface border border-border">
          <div className="mb-8">
            <div className="text-[22px] font-extrabold tracking-tight text-text-hi">
              INDUSTRIAL <span className="text-amber">OS</span>
            </div>
            <div className="text-[12.5px] text-text-lo mt-1">
              {mfaToken
                ? 'أدخل رمز التحقق من تطبيق المصادقة (Google Authenticator أو مماثل)'
                : 'اعرف ماذا تملك، أين يوجد، كم كلفك فعلياً، وماذا يجب أن تفعل بعد ذلك.'}
            </div>
          </div>

          {!mfaToken ? (
            <div onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}>
              <label className="block mb-1.5 text-[12px] text-text-mid">البريد الإلكتروني</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full px-3 py-2.5 mb-4 rounded bg-surface-alt border border-border text-text-hi font-mono text-[13px] outline-none"
              />

              <label className="block mb-1.5 text-[12px] text-text-mid">كلمة المرور</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full px-3 py-2.5 mb-5 rounded bg-surface-alt border border-border text-text-hi font-mono text-[13px] outline-none"
              />

              {error && <div className="mb-4 text-[12.5px] text-danger">{error}</div>}

              <button
                type="button"
                onClick={submit}
                disabled={loading}
                className="w-full py-2.5 rounded bg-amber font-bold text-[13.5px] transition disabled:opacity-60"
                style={{ color: '#1A1305' }}
              >
                {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
              </button>
            </div>
          ) : (
            <div onKeyDown={(e) => { if (e.key === 'Enter') submitMfaCode(); }}>
              <label className="block mb-1.5 text-[12px] text-text-mid">رمز التحقق (6 أرقام)</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="000000"
                className="w-full px-3 py-2.5 mb-5 rounded bg-surface-alt border border-border text-text-hi font-mono text-[20px] tracking-[6px] text-center outline-none"
              />

              {error && <div className="mb-4 text-[12.5px] text-danger">{error}</div>}

              <button
                type="button"
                onClick={submitMfaCode}
                disabled={loading}
                className="w-full py-2.5 rounded bg-amber font-bold text-[13.5px] transition disabled:opacity-60"
                style={{ color: '#1A1305' }}
              >
                {loading ? 'جاري التحقق...' : 'تأكيد'}
              </button>
              <button
                type="button"
                onClick={() => { setMfaToken(null); setCode(''); setError(null); }}
                className="w-full mt-2 py-2 text-[12px] text-text-lo"
              >
                رجوع لتسجيل الدخول
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-[10.5px] font-mono text-text-lo">
          يحتاج اتصالاً بـ backend حقيقي على NEXT_PUBLIC_API_URL
        </div>
      </div>
    </div>
  );
}
