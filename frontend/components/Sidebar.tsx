'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, LogOut } from 'lucide-react';
import { NAV_ITEMS } from '../lib/nav-items';
import { useAuth } from '../lib/auth-context';

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission, logout } = useAuth();

  return (
    <aside className="hidden md:flex flex-col flex-shrink-0 w-[232px] bg-surface border-l border-border">
      <div className="px-5 py-5 border-b border-border">
        <div className="text-[16px] font-extrabold tracking-tight text-text-hi">
          INDUSTRIAL <span className="text-amber">OS</span>
        </div>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          const allowed = hasPermission(item.permission);
          return (
            <Link
              key={item.id}
              href={allowed ? item.href : '#'}
              aria-disabled={!allowed}
              className={[
                'w-full flex items-center gap-2.5 px-3 py-2 rounded text-[13px] transition text-right',
                active ? 'bg-surface-alt text-text-hi border-r-2 border-amber' : 'border-r-2 border-transparent',
                allowed ? 'text-text-mid hover:bg-white/5' : 'text-text-lo cursor-not-allowed hover:bg-transparent',
              ].join(' ')}
              onClick={(e) => { if (!allowed) e.preventDefault(); }}
            >
              <Icon size={16} />
              <span className="flex-1">{item.label}</span>
              {!allowed && <Lock size={12} />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-text-lo text-[12.5px] hover:text-text-hi"
        >
          <LogOut size={14} /> تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
