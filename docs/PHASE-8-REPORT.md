# تقرير PHASE 8 — Purchasing / Suppliers

## 1. ما تم بناؤه
هاذي كتكمل الدورة الكاملة من الجهة التانية: **Supplier → Purchase Order → استلام → دخول فعلي للمخزون**، بنفس جودة PHASE 11 (Sales).

### Database
- `Supplier` (بسيط: بلد، عنوان، عملة، شروط دفع، Incoterm، مدة التسليم).
- `PurchaseOrder` + `PurchaseOrderItem`: كل سطر فيه `quantityOrdered` و`quantityReceived` منفصلين — يدعم **الاستلام الجزئي** (PHASE 14) بشكل طبيعي.

### منطق الأعمال (الأهم فهاد المرحلة)
- **Workflow محكوم**: `DRAFT → ORDERED → RECEIVING/RECEIVED`، مع `CANCELLED` كبديل (ممنوع إلغاء طلب بدأ الاستلام).
- **استلام جزئي حقيقي** (PHASE 14 — "دعم Partial Receipts"): يمكن استلام 40 من أصل 100 فمرة، والطلب كيبقى `RECEIVING` — الاستلامات التالية كتزيد `quantityReceived` تدريجياً حتى يوصل لـ`quantityOrdered` لكل الأسطر، وعندها الطلب يتحول تلقائياً لـ`RECEIVED`.
- **تكامل حقيقي مع Stock**: كل استلام كيستدعي `StockService.recordMovement()` الحقيقي (نوع `PURCHASE_RECEIPT`، كمية موجبة) — نفس الـ service المستعمل فPHASE 7 وPHASE 11، يعني أي رفض من طرف Stock (مثلاً مستودع من شركة أخرى) كينتقل مباشرة بدون ما يتسجل استلام جزئي خاطئ.
- **حساب Average Cost تلقائي** (أساس تبسيطي لـ True Landed Cost فPHASE 17): عند كل استلام، تكلفة المنتج المتوسطة (`averageCost`) كتتحدث بمعادلة **المتوسط المرجّح** الحقيقية: `(التكلفة القديمة × الكمية القديمة + التكلفة الجديدة × الكمية المستلمة) / المجموع` — تم التحقق منها رقمياً فالاختبارات (70×60 + 82×40 = 74.8 بالضبط).

### API
```
GET/POST /api/suppliers
GET/POST /api/purchases/orders
POST     /api/purchases/orders/:id/confirm   [purchases.approve]
POST     /api/purchases/orders/:id/cancel    [purchases.approve]
POST     /api/purchases/orders/:id/receive   [stock.receive مطلوبة داخلياً]
```

### Frontend (`/purchases`)
- جدول الطلبات + لوحة تفاصيل، تبين لكل سطر `المستلم/المطلوب` (مثلاً 40/100).
- زر "استلام الكل" يحسب تلقائياً الكميات المتبقية لكل الأسطر ويرسلها كاستلام واحد.

## 2. التحقق (تم تشغيله فعلياً)
```
Backend:  npx jest        → 81/81 tests ناجحة (14 اختبار جديد للمشتريات)
Backend:  npx tsc --noEmit → صفر أخطاء
Frontend: npx next build  → ✓ Compiled, 9 صفحات, صفر أخطاء TypeScript
```

تفصيل اختبارات Purchases (`test/purchases.service.spec.ts`):
- **Validation & tenant isolation**: رفض طلب بدون منتجات، رفض مورد/منتج من شركة أخرى.
- **Status transitions**: تأكيد DRAFT→ORDERED، رفض تأكيد طلب مو DRAFT، رفض إلغاء طلب بدأ الاستلام.
- **Permission enforcement**: رفض الاستلام بدون `stock.receive` (حتى قبل أي استعلام لقاعدة البيانات — fail-fast).
- **الاستلام الجزئي**: رفض استلام كمية تفوق المتبقي، استلام صحيح يترك الحالة `RECEIVING`، اكتمال كل الأسطر يحوّل لـ`RECEIVED`.
- **المتوسط المرجّح**: التحقق الرقمي الدقيق (74.8) من معادلة weighted average.
- **تكامل Stock**: **تمرير رفض StockService للأعلى** (مثلاً tenant mismatch) بدون تحديث أي كمية جزئياً — يضمن عدم فساد البيانات عند فشل جزء من العملية.

## 3. القيود
- **Supplier Comparison Engine** (PHASE 15 — مقارنة الموردين واقتراح الأفضل حسب السعر+الموثوقية+مدة التسليم): لم يُبنَ بعد، يحتاج بيانات تاريخية عن التأخيرات والأداء (Supplier Performance Score) اللي ماكاينش بعد.
- **RFQ** (طلب عروض أسعار من عدة موردين قبل PO — PHASE 14 workflow الكامل): مؤجل، حالياً كنبدأو مباشرة من PO.
- **True Landed Cost الكامل** (Freight, Insurance, Customs, Port Fees موزعة — PHASE 17): حالياً غير Average Cost بسيط من سعر الشراء فقط، بدون تكاليف الاستيراد الإضافية — هاذي محتاجة PHASE 9-10 (Import Management) قبل ما يكون ليها معنى كامل.
- لا معاملة مالية (Bill/Payment) مرتبطة بطلب الشراء بعد — PHASE 34-35 (Financial Operations / Accounting Engine).

## ✅ حالة PHASE 8: مكتمل (النواة الأساسية)
Database ✔ Partial Receipts ✔ تكامل حقيقي مع Stock ✔ Weighted Average Cost ✔ RBAC صارم ✔ Tests ✔ (81/81) ✔ Build ✔

**دابا الدورة الكاملة شغالة من الطرفين: Supplier → PO → استلام (يحرك المخزون + يحدث التكلفة) ← Stock → Sales Order → Delivery (يحرك المخزون) → Invoice.** المشروع وصل لمرحلة فيها **7 modules تشغيلية حقيقية مبنية ومختبرة بالكامل**.
