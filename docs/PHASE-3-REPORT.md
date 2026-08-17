# تقرير PHASE 3 — Companies / Users / Roles UI

## 1. ما تم بناؤه
الباك اند كان جاهزاً من PHASE 1 (services + controllers + RBAC enforcement). هاد المرحلة زادت الواجهة الحقيقية المتصلة بيه:

- **`/settings`**: صفحة موحدة بـ 3 tabs، محمية بصلاحية `settings.manage` عبر الـ Sidebar (تبان 🔒 لغير الأدوار المخوّلة).
  - **بيانات الشركة**: نموذج متصل بـ `GET/PATCH /api/companies/me` — يقرأ ويحفظ فعلياً (ICE, IF, RC, TP, عنوان...).
  - **المستخدمون**: جدول متصل بـ `GET /api/users` — دعوة مستخدم جديد (modal)، تفعيل/تعطيل، حذف ناعم. كل عملية بتستدعي الـ endpoint الحقيقي.
  - **الأدوار والصلاحيات**: مصفوفة RBAC حقيقية — تختار دور، تشوف كل الصلاحيات مجمعة حسب module (products, stock, sales...)، تعلّم/تلغي، وتحفظ عبر `POST /api/roles/:id/permissions`. SUPER_ADMIN معروض كـ "غير قابل للتعديل" (يطابق منطق الباك اند بالضبط).

## 2. الملفات
```
frontend/
├── lib/api-client.ts              # + endpoints users/roles/companies
├── lib/nav-items.ts               # + رابط "الإعدادات"
├── components/settings/
│   ├── CompanySettingsTab.tsx
│   ├── UsersTab.tsx                # + InviteUserModal
│   └── RolesTab.tsx
└── app/(app)/settings/page.tsx
```

## 3. التحقق
```
npx next build   →  ✓ Compiled successfully, 9 صفحات, صفر أخطاء TypeScript
npx jest (backend) → 28/28 tests ناجحة (لم يتأثر الباك اند)
```
تم تشغيل الاثنين فعلياً هنا.

## 4. ملاحظة تصميم مهمة
دعوة مستخدم من الواجهة حالياً **لا تعيّن دوراً مباشرة** (`roleIds: []`) — التصميم المتعمّد هو: تُنشأ الحساب من tab "المستخدمون"، ثم يُعيَّن الدور من tab "الأدوار" (`assignRole`). هذا يفصل "من يمكنه الدخول" عن "ماذا يمكنه أن يفعل"، بما يطابق مبدأ RBAC. لو تفضّلون دمج اختيار الدور مباشرة في نافذة الدعوة، هذا تعديل بسيط عند الطلب.

## 5. القيود
- لا توجد شاشة لإنشاء دور مخصص جديد (`createRole` موجود فالـ API، الزر فالواجهة لسا ماكاينش) — يمكن إضافته بسرعة عند الحاجة.
- لا Tests للفرونت اند (نفس القرار المتخذ فـ PHASE 2 — سننتظر أول module فيه منطق أعمال حقيقي).

## ✅ حالة PHASE 3: مكتمل
Backend (من PHASE 1) ✔ Frontend UI ✔ متصل بـ API حقيقي ✔ RBAC محترم فالواجهة ✔ Build صحيح ✔

**جاهزين لـ PHASE 4 (Products / Categories / Brands / Dynamic Attributes) — أول module تشغيلي حقيقي فالنظام، وهو الأساس اللي كيبنى عليه Stock/Sales/Purchases/Imports.**
