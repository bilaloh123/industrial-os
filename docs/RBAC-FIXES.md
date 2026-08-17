# تقرير إصلاح ثغرات RBAC (متابعة FULL-SYSTEM-AUDIT.md §4)

## الثغرتان اللتان تم إصلاحهما

### 1. `CustomersController` — بدون أي صلاحية مخصصة
**قبل**: أي مستخدم مسجّل الدخول (بغض النظر عن دوره) يقدر يشوف وينشئ عملاء — الحماية الوحيدة كانت `JwtAuthGuard` (تسجيل دخول فقط، بدون RBAC).

**بعد**:
- أُضيفت صلاحيتان جديدتان لكتالوج PHASE 5: `customers.view`، `customers.manage`.
- `GET /api/customers` و`GET /api/customers/:id` → يتطلبان `customers.view`.
- `POST /api/customers` → يتطلب `customers.manage`.
- الأدوار المحدّثة تلقائياً: `SALES_MANAGER`, `SALES_REP` (view+manage)، `ACCOUNTANT`, `DELIVERY_MANAGER`, `AUDITOR`, `READ_ONLY` (view فقط).

### 2. `StockController` — إنشاء مواقع التخزين محمي بصلاحية ضعيفة جداً
**قبل**: إنشاء Warehouse/Zone/Rack/Shelf/Bin كلها كانت محمية بـ`stock.view` — يعني أي شخص عندو حق "مشاهدة" المخزون فقط (مثلاً `WAREHOUSE_OPERATOR` أو `READ_ONLY`) كان يقدر يبني مستودعات جديدة كاملة.

**بعد**:
- أُضيفت صلاحية جديدة: `stock.manage_locations`.
- `POST /api/stock/warehouses`، `.../zones`، `.../racks`، `.../shelves`، `.../bins` → كلها تتطلب دابا `stock.manage_locations` بدل `stock.view`.
- عمليات القراءة (`GET warehouses`, `GET summary`, `GET movements`) والتحرك اليومي (`POST movements`) **بقات كما هي** بـ`stock.view` — التغيير مس فقط عمليات البنية التحتية الإدارية.
- الدور الوحيد اللي عندو هاد الصلاحية افتراضياً: `WAREHOUSE_MANAGER` (وليس `WAREHOUSE_OPERATOR`).

## التحقق (تم تشغيله فعلياً)

اختبار جديد `test/rbac-gap-closure.spec.ts` — **ماشي اختبار منطق، بل فحص فعلي للـ metadata** اللي `PermissionsGuard` كيقرأها وقت الطلب الحقيقي (`Reflect.getMetadata`). هذا يضمن أن الإصلاح حقيقي على مستوى الـ endpoint نفسه، مو غير افتراض من قراءة الكود.

```
Backend:  npx jest        → 100/100 tests ناجحة (7 اختبارات جديدة لإغلاق الثغرتين)
Backend:  npx tsc --noEmit → صفر أخطاء
Frontend: npx next build  → ✓ Compiled, 10 صفحات, صفر أخطاء TypeScript
```

## أثر جانبي مهم
لو عندكم مستخدمين موجودين فقاعدة بيانات حقيقية من قبل هاد الإصلاح، خاصكم تشغّلو:
```
npx prisma db seed
```
باش يتزرعو الصلاحيتين الجديدتين (`customers.*`, `stock.manage_locations`) ويترتبطو تلقائياً بالأدوار القياسية المحدّثة. الأدوار المخصصة (Custom roles) خاصها تعديل يدوي من `/settings` → "الأدوار والصلاحيات".

## الثغرات المتبقية (غير مُصلحة فهاد الدفعة، حسب الأولوية فـ FULL-SYSTEM-AUDIT.md)
- لا MFA فعلي.
- لا rate limiting مخصص لـ`/api/auth/login` (الحماية الحالية: lockout بعد 5 محاولات فاشلة + rate limiting عام).
