# تقرير PHASE 11 — Sales (Quotation → Order → Delivery → Invoice)

## 1. ما تم بناؤه
هاذي أول مرحلة كتربط Products + Stock + Customers بعملية أعمال حقيقية كاملة، من عرض السعر للفاتورة.

### Database
- `Customer` (بسيط: ICE, عنوان, شروط دفع, سقف ائتمان, رصيد حالي).
- `SalesOrder` + `SalesOrderItem`: كل سطر يحتفظ بـ **snapshot** للتكلفة (`unitCost`) وقت إنشاء الطلب — هذا أساسي لحساب **الهامش الحقيقي** لاحقاً حتى لو تغيّرت تكلفة المنتج فالمستقبل (مطابق لمبدأ PHASE 17).
- إضافة `minMarginPercent` لموديل `Product` — الأساس التقني لـ PHASE 26.

### منطق الأعمال (الأهم فهاد المرحلة)
- **Workflow حقيقي بحالات محكومة** (PHASE 24): `QUOTATION → READY → PICKING → PACKED → DISPATCHED → DELIVERED → INVOICED`، مع `CANCELLED` كحالة نهائية بديلة. **الانتقالات ممنوعة إلا وفق الترتيب** — مستحيل تقفز من `QUOTATION` مباشرة لـ`DELIVERED`، ومستحيل تلغي طلب وصل لـ`PACKED` (تجاوز نافذة الإلغاء).
- **Minimum Margin Protection حقيقية** (PHASE 26): عند إنشاء طلب، كل سطر كيتفحص مقابل `product.minMarginPercent`. إذا الهامش أقل من الحد الأدنى، الباك اند كيرفض بـ`403 AUTHORIZATION REQUIRED` مع تفاصيل كل منتج متجاوز، **إلا إذا تم توفير `marginOverrideReason`** — وفي هاد الحالة كيتسجل فالـ Audit Log مع كل التفاصيل (المستخدم، السعر، التكلفة، الهامش، السبب) بالضبط كيفما طلبات المواصفات.
- **تكامل حقيقي مع Stock** (مو محاكاة): عملية `deliver()` كتستدعي `StockService.recordMovement()` الحقيقي لكل سطر فالطلب (نوع `SALE`، كمية سالبة) — يعني المخزون كيتحرك فعلاً. إذا الكمية ماكافيتش، `StockService` كيرفض العملية (نفس الحماية من الرصيد السالب المبنية فPHASE 7) والطلب ما يتسجلش كـ`DELIVERED`.

### API
```
GET/POST /api/customers
GET/POST /api/sales/orders
POST     /api/sales/orders/:id/confirm    [sales.approve]
POST     /api/sales/orders/:id/advance/:status
POST     /api/sales/orders/:id/deliver    [يستدعي Stock حقيقياً]
POST     /api/sales/orders/:id/invoice    [sales.approve]
POST     /api/sales/orders/:id/cancel     [sales.cancel]
```

### Frontend (`/sales`)
- جدول الطلبات + لوحة تفاصيل تفاعلية (اضغط على طلب) بمسار حالة حي.
- أزرار الانتقال تتبدّل حسب الحالة الحالية فقط (تصميم كيمنع محاولة انتقال غير صالح من الواجهة أصلاً).
- **Modal إنشاء طلب** يتعامل مع حماية الهامش الأدنى: إذا الباك اند رجّع `AUTHORIZATION REQUIRED`، الواجهة كتبين تحذير أحمر وتطلب سبب الاستثناء، وبعد التأكيد كترسل الطلب مرة أخرى بـ`marginOverrideReason`.

## 2. التحقق (تم تشغيله فعلياً)
```
Backend:  npx jest        → 67/67 tests ناجحة (15 اختبار جديد للمبيعات)
Backend:  npx tsc --noEmit → صفر أخطاء
Frontend: npx next build  → ✓ Compiled, 9 صفحات, صفر أخطاء TypeScript
```

تفصيل اختبارات Sales (`test/sales.service.spec.ts`):
- **Minimum Margin Protection**: رفض بيع تحت الهامش الأدنى بدون سبب، قبوله بسبب + تسجيله فالـ Audit، قبول عند الهامش بالضبط (حالة حدّية)، عدم منع منتجات بلا حد أدنى معرّف حتى لو بيع بخسارة.
- **Validation & tenant isolation**: رفض طلب بدون منتجات، رفض منتج من شركة أخرى، رفض عميل من شركة أخرى.
- **Status transitions**: قبول الانتقال الصحيح، رفض القفز بين الحالات، رفض الخروج من حالة نهائية، رفض إلغاء طلب تجاوز نافذة الإلغاء.
- **تكامل Stock حقيقي**: التحقق من استدعاء `recordMovement` مرة لكل سطر بالكمية والنوع الصحيحين، رفض التسليم لطلب لسا فحالة مبكرة، **تمرير رفض StockService للأعلى** (مثلاً نقص المخزون) بدون ما يتسجل الطلب كمُسلَّم.
- **حساب الهامش الحقيقي**: تحقق رقمي مطابق تماماً للمثال المذكور فPHASE 17 (100 تكلفة شراء + 27 تكاليف استيراد = 127 تكلفة حقيقية، بيع بـ170 = هامش 25.29%).

## 3. القيود
- **Stock Reservations** (Available = On Hand - Reserved): لسا ماكاينش — حالياً الطلب كيحجز المخزون فعلياً فقط لحظة التسليم (`deliver`)، مو من لحظة `READY`/`PICKING`. هذا يعني تيوريا يمكن يتوافق عليك نفس المنتج فبيعتين متزامنتين قبل التسليم. الحل الصحيح (`stock_reservations` جدول) مؤجل لمرحلة لاحقة عند الحاجة الفعلية.
- **Picking Lists مرتبة حسب الموقع** (PHASE 29): الانتقال لـ`PICKING` حالياً غير حالة بسيطة، بدون توليد قائمة تحضير فعلية مرتبة بالموقع.
- **إصدار فاتورة حقيقية** (PDF, رقم فاتورة تسلسلي): حالياً `invoice()` غير يبدّل الحالة لـ`INVOICED` — التوليد الفعلي للمستند (PHASE 47) مؤجل.
- لا واجهة لإدارة العملاء (إنشاء عميل جديد) بعد فـ`/sales` — الـ API جاهز (`POST /api/customers`)، محتاجة زر "عميل جديد" بسيط.

## ✅ حالة PHASE 11: مكتمل (النواة الأساسية)
Database ✔ Workflow محكوم بحالات ✔ Minimum Margin Protection ✔ تكامل حقيقي مع Stock ✔ True Margin ✔ Tests ✔ (67/67) ✔ Build ✔

**دابا عندنا سلسلة كاملة شغالة فعلياً: Product → Stock → Sales Order → Delivery (يحرك المخزون) → Invoice.** الخطوة الجاية المنطقية هي PHASE 8 (Purchasing) باش تكمل الدورة من الجهة الأخرى (Supplier → Purchase → Stock In).
