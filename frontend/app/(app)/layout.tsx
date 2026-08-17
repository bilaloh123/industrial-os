'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Topbar } from '../../components/Topbar';
import { CommandPalette } from '../../components/CommandPalette';
import { OfflineBanner } from '../../components/OfflineBanner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Placeholder search: real implementation calls the Smart Technical Search
  // API from PHASE 11 once the products/customers/orders modules exist.
  const search = useCallback(async (_query: string) => [], []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-lo text-sm font-mono">
        جاري التحقق من الجلسة...
      </div>
    );
  }
  if (!user) return null; // redirecting

  return (
    <div dir="rtl" className="flex min-h-screen bg-bg">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} search={search} />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <OfflineBanner />
        <Topbar onOpenPalette={() => setPaletteOpen(true)} />
        <main className="flex-1 overflow-y-auto p-5">{children}</main>
      </div>
    </div>
  );
}
