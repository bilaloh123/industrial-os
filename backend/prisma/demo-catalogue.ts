// ============================================================
// PHASE 10 — demo category + dynamic attribute seed.
// These are the exact examples given in the product spec:
// ROULEMENT, COURROIE, FLEXIBLE, HYDRAULIQUE.
// ============================================================
export const DEMO_CATEGORIES = ['Roulements', 'Courroies', 'Flexibles', 'Hydraulique'];

export const DEMO_ATTRIBUTES: Record<string, { key: string; label: string; type: 'STRING' | 'NUMBER' | 'ENUM'; unit?: string }[]> = {
  Roulements: [
    { key: 'inner_diameter', label: 'القطر الداخلي', type: 'NUMBER', unit: 'mm' },
    { key: 'outer_diameter', label: 'القطر الخارجي', type: 'NUMBER', unit: 'mm' },
    { key: 'width', label: 'العرض', type: 'NUMBER', unit: 'mm' },
    { key: 'seal_type', label: 'نوع الغلاف', type: 'STRING' },
    { key: 'clearance', label: 'الخلوص', type: 'STRING' },
  ],
  Courroies: [
    { key: 'profile', label: 'المقطع', type: 'STRING' },
    { key: 'length', label: 'الطول', type: 'NUMBER', unit: 'mm' },
    { key: 'belt_width', label: 'العرض', type: 'NUMBER', unit: 'mm' },
    { key: 'height', label: 'الارتفاع', type: 'NUMBER', unit: 'mm' },
  ],
  Flexibles: [
    { key: 'diameter', label: 'القطر', type: 'STRING' },
    { key: 'working_pressure', label: 'الضغط التشغيلي', type: 'NUMBER', unit: 'bar' },
    { key: 'max_pressure', label: 'الضغط الأقصى', type: 'NUMBER', unit: 'bar' },
    { key: 'flexible_length', label: 'الطول', type: 'NUMBER', unit: 'm' },
    { key: 'fitting', label: 'نوع الوصلة', type: 'STRING' },
  ],
  Hydraulique: [
    { key: 'flow', label: 'التدفق', type: 'NUMBER', unit: 'L/min' },
    { key: 'pressure', label: 'الضغط', type: 'NUMBER', unit: 'bar' },
    { key: 'thread', label: 'نوع الملولب', type: 'STRING' },
    { key: 'hyd_diameter', label: 'القطر', type: 'STRING' },
  ],
};
