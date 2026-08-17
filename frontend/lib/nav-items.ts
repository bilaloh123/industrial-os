import {
  LayoutGrid, Package, ShoppingCart, Ship, Boxes, Receipt, Users2,
  Truck, Wrench, Wallet, FileBarChart, Sparkles, Bell, Settings,
} from 'lucide-react';

export type NavItem = {
  id: string;
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  permission: string | null;
};

// Order and labels per PHASE 6 (Navigation principale).
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', href: '/dashboard', label: 'لوحة التحكم', icon: LayoutGrid, permission: null },
  { id: 'products', href: '/products', label: 'المنتجات', icon: Package, permission: 'products.view' },
  { id: 'purchases', href: '/purchases', label: 'المشتريات', icon: ShoppingCart, permission: 'purchases.view' },
  { id: 'imports', href: '/imports', label: 'الاستيراد', icon: Ship, permission: 'imports.view' },
  { id: 'stock', href: '/stock', label: 'المخزون', icon: Boxes, permission: 'stock.view' },
  { id: 'sales', href: '/sales', label: 'المبيعات', icon: Receipt, permission: 'sales.view' },
  { id: 'customers', href: '/customers', label: 'العملاء', icon: Users2, permission: null },
  { id: 'delivery', href: '/delivery', label: 'التوصيل', icon: Truck, permission: 'delivery.view' },
  { id: 'sav', href: '/sav', label: 'خدمة ما بعد البيع', icon: Wrench, permission: null },
  { id: 'finance', href: '/finance', label: 'المالية', icon: Wallet, permission: 'finance.view' },
  { id: 'reports', href: '/reports', label: 'التقارير', icon: FileBarChart, permission: 'reports.view' },
  { id: 'ai', href: '/ai', label: 'المساعد الذكي', icon: Sparkles, permission: 'ai.use' },
  { id: 'settings', href: '/settings', label: 'الإعدادات', icon: Settings, permission: 'settings.manage' },
];
