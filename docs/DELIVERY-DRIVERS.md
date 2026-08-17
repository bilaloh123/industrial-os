# تقرير التوصيل والسائقين (Delivery & Drivers)

أول وحدة كاملة جديدة غير مبنية أصلاً — بُنيت من الصفر (schema + backend + frontend).

## ما تم بناؤه

### مبدأ التصميم: تكامل حقيقي، مو تكرار
بدل ما نبني منطق "تسليم" منفصل يكرر اللي كاين فـ`SalesService`، وحدة التوصيل كتُدير **الجزء اللوجستي** (تعيين سائق، تتبع الرحلة) وكتستدعي **`SalesService.deliver()` الحقيقي** لحظة التأكيد الفعلي — يعني نفس سجل المخزون، نفس حماية الرصيد السالب، بلا أي تكرار كود.

### Workflow كامل (5 حالات)
```
PENDING → ASSIGNED → IN_TRANSIT → DELIVERED
                                 ↘ FAILED
```
- **`PENDING`**: توصيل مُنشأ لطلب بيع بحالة `PACKED` (واحد بالضبط لكل طلب — نفس نمط traceability المستعمل فـInvoice/Bill).
- **`ASSIGNED`**: تعيين سائق نشط.
- **`IN_TRANSIT`**: بدء الرحلة — كيحوّل طلب البيع تلقائياً لـ`DISPATCHED` (تزامن حقيقي بين الوحدتين).
- **`DELIVERED`**: تأكيد الاستلام — **كيستدعي `SalesService.deliver()` الحقيقي** (يحرك المخزون فعلياً)، ويسجل اسم المستلم والوقت (إثبات تسليم).
- **`FAILED`**: فشل المحاولة (عميل غايب، رفض...) — **بلا أي لمس للمخزون أو حالة الطلب**.

### إدارة السائقين
CRUD بسيط: اسم، هاتف، معلومات المركبة، تفعيل/تعطيل.

### صلاحيات جديدة
```
delivery.view    — عرض التوصيلات والسائقين
delivery.manage  — تعيين سائقين، بدء رحلة، تأكيد/فشل تسليم
```
دور `DELIVERY_MANAGER` (كان موجود بلا صلاحيات فعلية مسبقاً) دابا عندو `delivery.view` و`delivery.manage` كافتراضي.

### API
```
GET/POST /api/drivers                       [delivery.view / delivery.manage]
PATCH    /api/drivers/:id/active             [delivery.manage]
GET/POST /api/deliveries                     [delivery.view / delivery.manage]
POST     /api/deliveries/:id/assign-driver   [delivery.manage]
POST     /api/deliveries/:id/start-transit   [delivery.manage]
POST     /api/deliveries/:id/complete        [delivery.manage]
POST     /api/deliveries/:id/fail            [delivery.manage]
```

### Frontend
- صفحة `/delivery` جديدة (كانت موجودة فالـ nav بلا حماية RBAC — دابا محمية بـ`delivery.view`)
- تبويبين: التوصيلات (جدول + لوحة تفاصيل بأزرار workflow حسب الحالة) والسائقون
- Modal إنشاء توصيل (فقط طلبات `PACKED` غير المرتبطة بتوصيل سابق تظهر) وmodal إضافة سائق

## التحقق (تم تشغيله فعلياً)
```
Backend:  npx jest        → 208/208 tests ناجحة (19 اختبار جديد: 14 لـDeliveryService + 5 لـDriversService)
Backend:  npx tsc --noEmit → صفر أخطاء
Frontend: npx jest        → 17/17 لسا ناجحة
Frontend: npx next build  → ✓ Compiled, 14 صفحة (زادت من 13)، صفر أخطاء TypeScript
```

تفصيل الاختبارات الحاسمة:
- **التحقق أن `complete()` كتستدعي `SalesService.deliver()` الحقيقي** بالضبط بنفس `warehouseId` المخزّن فالتوصيل — مو محاكاة.
- **انتشار الرفض**: إذا `SalesService.deliver()` رفض (مثلاً رصيد غير كافٍ)، التوصيل **ما يتعلمش DELIVERED** — الخطأ ينتشر كامل بلا "نجاح جزئي" وهمي.
- **`fail()` ما كيلمسش المخزون أبداً** — مُختبر صراحة.
- عزل الشركات على كل مستوى (سائقين، توصيلات).

## القيود
- **لا خرائط/تتبع GPS حي** — الموقع الجغرافي للسائق أثناء `IN_TRANSIT` غير متتبّع.
- **توصيل واحد لكل طلب بيع** — لا دعم لتقسيم طلب واحد على عدة رحلات توصيل (partial delivery runs).
- **لا إشعارات تلقائية للعميل** (SMS/email) عند تغيير حالة التوصيل — مرتبط بمركز الإشعارات غير المبني بعد.
- **لا تقييم أداء سائقين** (نسبة نجاح، متوسط وقت التسليم) — البيانات الخام موجودة (`deliveredAt`, `status`)، لكن التحليل غير مبني.

## ✅ حالة الوحدة: مكتملة (Backend + Frontend)
Schema جديد ✔ Workflow كامل 5 حالات ✔ تكامل حقيقي مع Sales (بلا تكرار كود) ✔ صلاحيات RBAC مخصصة ✔ واجهة كاملة ✔ Tests ✔ (208/208 كلي، 19 جديد) ✔ Build ✔ (14 صفحة)

---

## 🎯 حالة الـ Backlog

المتبقي: **SAV** (خدمة ما بعد البيع)، **مركز الإشعارات**، **محرك محاسبي كامل**، **AI Assistant**، وتفاصيل صغيرة (رموز MFA احتياطية، تعديل/حذف الكتالوج).
