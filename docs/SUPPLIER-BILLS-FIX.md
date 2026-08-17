# تقرير إصلاح Supplier Bills/Payments (متابعة FULL-SYSTEM-AUDIT.md §5)

## الفجوة الأصلية
PHASE 34 (Financial Operations) كانت مبنية غير من جهة العملاء (Customer Invoices). جهة الموردين (Supplier Bills — الديون تجاه الموردين، "Payables") كانت غير موجودة، رغم أن Dashboard كان يذكر "Payables" كمؤشر مطلوب (PHASE 37).

## الحل المبني — نفس نمط Customer Invoices بالضبط

### Database
- `Bill`: مرتبطة **حصرياً** بـ `PurchaseOrder` واحد (`@unique purchaseOrderId`) — نفس مبدأ traceability المطبّق على `Invoice`.
- `SupplierPayment`: يدعم دفعات جزئية متعددة.
- ترقيم تسلسلي منفصل: `BILL-2026-0001`.

### منطق الأعمال
- **توليد تلقائي**: `PurchasesService.receive()` كيستدعي `FinanceService.createBillFromPurchaseOrder()` **فقط لما الطلب يوصل لحالة `RECEIVED` كاملة** — مُختبر صراحة أن استلام جزئي (يبقى `RECEIVING`) ما كيولّدش فاتورة مورد قبل الأوان.
- **منع الدفع الزائد**: نفس منطق `recordPayment()` بالضبط، مطبّق على `recordSupplierPayment()`.
- **`getFinancialSummary()`** دابا كيرجع `payables` منفصلة عن `receivables` — محسوبة من فواتير الموردين غير المدفوعة/المدفوعة جزئياً.

### API
```
GET  /api/finance/bills
GET  /api/finance/bills/:id
POST /api/finance/bills/:id/payments   [finance.create]
```
(نفس صلاحيات `finance.view`/`finance.create` المستعملة مسبقاً — بلا حاجة لصلاحيات جديدة.)

### Frontend
- **`/finance`** دابا فيها تبويبين: **فواتير العملاء** و**فواتير الموردين** — نفس UI pattern، تسجيل دفعة يخدم على الاثنين.
- **Dashboard**: بدّلنا مؤشر "منتجات حرجة" (اللي كان مكرر مع لوحة التنبيهات تحت) بـ**"الذمم الدائنة"** الحقيقية.

## التحقق (تم تشغيله فعلياً)
```
Backend:  npx jest        → 115/115 tests ناجحة (8 اختبارات جديدة)
Backend:  npx tsc --noEmit → صفر أخطاء
Frontend: npx next build  → ✓ Compiled, 10 صفحات, صفر أخطاء TypeScript
```

تفصيل الاختبارات الجديدة:
- **Traceability**: رفض فاتورة مورد ثانية لنفس الطلب، حساب `totalAmount` صحيح من `quantityOrdered × unitCost`، ترقيم تسلسلي صحيح.
- **منع الدفع الزائد**: نفس التغطية المطبقة على Customer Invoices (رفض تجاوز، انتقال لـ`PAID`، tenant isolation).
- **تكامل Purchases↔Finance**: التحقق الصريح أن `createBillFromPurchaseOrder` **تُستدعى فقط عند `RECEIVED`** وليس عند `RECEIVING` (استلام جزئي) — هذا الفحص الحاسم اللي يثبت التوقيت الصحيح.
- **`getFinancialSummary`**: التحقق أن `payables` كتُحسب بشكل منفصل تماماً عن `receivables`، بمعادلة صحيحة (unpaid + remaining من partially-paid).

## القيود المتبقية
- لا **Exchange Rate conversion** على مستوى الفاتورة (نفس القيد المذكور فـInvoice الأصلية).
- لا **Aging report** مخصص للموردين (فواتير متأخرة تجاه الموردين) — البنية جاهزة (`dueDate`) لكن التقرير المرئي غير مبني.

## ✅ النتيجة
الفجوتان المتبقيتان من الأولوية العالية بعد هاد الإصلاح: **Product Variants** و**Import Management + True Landed Cost**.
