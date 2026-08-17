// ============================================================
// PHASE 5 — Granular permission catalogue
// Grows as new modules (stock, sales, imports, finance...) are built
// in later phases. Phase 1 seeds the permissions needed for the
// modules that exist today: users, roles, settings, plus placeholders
// for modules coming in later phases (kept here so RBAC UI can show
// them as "coming soon" without a schema change per phase).
// ============================================================
export const PERMISSIONS_CATALOGUE: { key: string; module: string; description: string }[] = [
  // --- Phase 1: platform / admin ---
  { key: 'users.manage', module: 'users', description: 'إدارة المستخدمين (دعوة، تعطيل، حذف)' },
  { key: 'roles.manage', module: 'roles', description: 'إدارة الأدوار والصلاحيات' },
  { key: 'settings.manage', module: 'settings', description: 'تعديل إعدادات الشركة' },
  { key: 'audit.view', module: 'audit', description: 'الاطلاع على سجل التدقيق' },

  // --- Placeholders for upcoming phases (PHASE 4..24 of the product spec) ---
  { key: 'products.view', module: 'products', description: 'عرض المنتجات' },
  { key: 'products.create', module: 'products', description: 'إنشاء منتجات' },
  { key: 'products.edit', module: 'products', description: 'تعديل منتجات' },
  { key: 'products.archive', module: 'products', description: 'أرشفة منتجات' },

  { key: 'stock.view', module: 'stock', description: 'عرض المخزون' },
  { key: 'stock.receive', module: 'stock', description: 'استلام بضاعة' },
  { key: 'stock.transfer', module: 'stock', description: 'تحويل مخزون' },
  { key: 'stock.adjust', module: 'stock', description: 'تعديل مخزون' },
  { key: 'stock.count', module: 'stock', description: 'جرد المخزون' },
  { key: 'stock.manage_locations', module: 'stock', description: 'إنشاء/تعديل مستودعات ومواقع التخزين' },

  { key: 'customers.view', module: 'customers', description: 'عرض العملاء' },
  { key: 'customers.manage', module: 'customers', description: 'إنشاء وتعديل العملاء' },

  { key: 'sales.view', module: 'sales', description: 'عرض المبيعات' },
  { key: 'sales.create', module: 'sales', description: 'إنشاء طلبات بيع' },
  { key: 'sales.approve', module: 'sales', description: 'اعتماد طلبات البيع' },
  { key: 'sales.cancel', module: 'sales', description: 'إلغاء طلبات البيع' },

  { key: 'purchases.view', module: 'purchases', description: 'عرض المشتريات' },
  { key: 'purchases.create', module: 'purchases', description: 'إنشاء طلبات شراء' },
  { key: 'purchases.approve', module: 'purchases', description: 'اعتماد طلبات الشراء' },

  { key: 'imports.view', module: 'imports', description: 'عرض ملفات الاستيراد' },
  { key: 'imports.create', module: 'imports', description: 'إنشاء ملف استيراد' },
  { key: 'imports.edit', module: 'imports', description: 'تعديل ملف استيراد' },
  { key: 'imports.close', module: 'imports', description: 'إغلاق ملف استيراد' },

  { key: 'finance.view', module: 'finance', description: 'عرض البيانات المالية' },
  { key: 'finance.create', module: 'finance', description: 'إنشاء عمليات مالية' },
  { key: 'finance.approve', module: 'finance', description: 'اعتماد عمليات مالية' },

  { key: 'reports.view', module: 'reports', description: 'عرض التقارير' },
  { key: 'reports.export', module: 'reports', description: 'تصدير التقارير' },

  { key: 'delivery.view', module: 'delivery', description: 'عرض التوصيلات والسائقين' },
  { key: 'delivery.manage', module: 'delivery', description: 'تعيين السائقين وتأكيد التسليم' },

  { key: 'ai.use', module: 'ai', description: 'استخدام المساعد الذكي' },
  { key: 'ai.financial_analysis', module: 'ai', description: 'تحليلات مالية عبر AI' },
];

// Default permission bundles per standard role (PHASE 4 roles).
// SUPER_ADMIN is intentionally excluded — it bypasses checks entirely (see PermissionsGuard).
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  DIRECTOR: PERMISSIONS_CATALOGUE.map((p) => p.key), // full visibility per PHASE 44
  PURCHASING_MANAGER: ['purchases.view', 'purchases.create', 'purchases.approve', 'products.view', 'reports.view'],
  IMPORT_MANAGER: ['imports.view', 'imports.create', 'imports.edit', 'imports.close', 'reports.view'],
  WAREHOUSE_MANAGER: ['stock.view', 'stock.receive', 'stock.transfer', 'stock.adjust', 'stock.count', 'stock.manage_locations', 'products.view'],
  WAREHOUSE_OPERATOR: ['stock.view', 'stock.receive', 'stock.count'],
  SALES_MANAGER: ['sales.view', 'sales.create', 'sales.approve', 'sales.cancel', 'products.view', 'customers.view', 'customers.manage', 'reports.view'],
  SALES_REP: ['sales.view', 'sales.create', 'products.view', 'customers.view', 'customers.manage'],
  ACCOUNTANT: ['finance.view', 'finance.create', 'finance.approve', 'customers.view', 'reports.view', 'reports.export'],
  DELIVERY_MANAGER: ['sales.view', 'customers.view', 'delivery.view', 'delivery.manage'],
  TECHNICIAN: [],
  AUDITOR: ['audit.view', 'reports.view', 'finance.view', 'stock.view', 'sales.view', 'purchases.view', 'customers.view'],
  READ_ONLY: ['products.view', 'stock.view', 'sales.view', 'purchases.view', 'customers.view', 'reports.view'],
};
