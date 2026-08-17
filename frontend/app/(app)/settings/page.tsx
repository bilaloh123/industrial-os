'use client';

import { useState } from 'react';
import { CompanySettingsTab } from '../../../components/settings/CompanySettingsTab';
import { UsersTab } from '../../../components/settings/UsersTab';
import { RolesTab } from '../../../components/settings/RolesTab';
import { SecurityTab } from '../../../components/settings/SecurityTab';
import { CatalogTab } from '../../../components/settings/CatalogTab';

const TABS = [
  { id: 'company', label: 'بيانات الشركة' },
  { id: 'users', label: 'المستخدمون' },
  { id: 'roles', label: 'الأدوار والصلاحيات' },
  { id: 'security', label: 'الأمان' },
  { id: 'catalog', label: 'الفئات والخصائص' },
] as const;

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('company');

  return (
    <div>
      <div className="flex gap-1 mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded text-[12.5px] border ${
              tab === t.id ? 'bg-surface-alt text-text-hi border-border-lite' : 'text-text-lo border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'company' && <CompanySettingsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'catalog' && <CatalogTab />}
    </div>
  );
}
