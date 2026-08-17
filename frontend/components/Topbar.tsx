'use client';

import { usePathname } from 'next/navigation';
import { Search, Bell } from 'lucide-react';
import { NAV_ITEMS } from '../lib/nav-items';
import { useAuth } from '../lib/auth-context';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'مدير النظام',
  DIRECTOR: 'المدير العام',
  PURCHASING_MANAGER: 'مسؤول المشتريات',
  IMPORT_MANAGER: 'مسؤول الاستيراد',
  WAREHOUSE_MANAGER: 'مسؤول المخزن',
  WAREHOUSE_OPERATOR: 'عامل المخزن',
  SALES_MANAGER: 'مدير المبيعات',
  SALES_REP: 'مندوب المبيعات',
  ACCOUNTANT: 'المحاسب',
  DELIVERY_MANAGER: 'مسؤول التوصيل',
  TECHNICIAN: 'تقني',
  AUDITOR: 'مدقق',
  READ_ONLY: 'قراءة فقط',
};

export function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const active = NAV_ITEMS.find((n) => pathname.startsWith(n.href));
  const primaryRole = user?.roles?.[0] ?? '';

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-border">
      <div>
        <div className="text-text-hi text-[15px] font-semibold">{active?.label ?? ''}</div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenPalette}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded text-[12px] text-text-lo bg-surface-alt border border-border"
        >
          <Search size={13} /> بحث سريع
          <kbd className="px-1 text-[10px] border border-border rounded">⌘K</kbd>
        </button>
        <Bell size={16} className="text-text-lo" />
        {user && (
          <div className="flex items-center gap-2 pr-3 border-r border-border">
            <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center bg-amber text-[11px] font-bold" style={{ color: '#1A1305' }}>
              {(ROLE_LABELS[primaryRole] ?? primaryRole)[0]}
            </div>
            <div>
              <div className="text-text-hi text-[12px]">{ROLE_LABELS[primaryRole] ?? primaryRole}</div>
              <div className="text-text-lo text-[10.5px] font-mono">{primaryRole}</div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
