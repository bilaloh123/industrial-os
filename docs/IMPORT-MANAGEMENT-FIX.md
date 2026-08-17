# تقرير Import Management + True Landed Cost (PHASE 16/17)

آخر فجوة من الأولوية العالية فـ `FULL-SYSTEM-AUDIT.md §5`.

## ما تم بناؤه

### Database
- `Import`: مرتبطة **حصرياً** بـ`PurchaseOrder` واحد (`@unique purchaseOrderId`) — نفس نمط traceability المطبّق على Invoice/Bill. ترقيم تسلسلي `IMP-2026-0001`.
- `ImportExpense`: 10 أنواع تكاليف مطابقة حرفياً للمواصفات (Freight, Insurance, Customs, Transit, Port Fees, Handling, Bank Fees, Documentation, Storage, Other).
- Statuses الـ11 كاملة من PHASE 16: `DRAFT → ORDERED → PREPARING → SHIPPED → AT_PORT → CUSTOMS → RELEASED → RECEIVING → RECEIVED → CLOSED` (+ `CANCELLED`).

### True Landed Cost Engine — الأهم فهاد المرحلة
- **طريقة "By Value"** (التوزيع حسب القيمة، من بين الطرق المذكورة فPHASE 17): كل تكاليف الاستيراد (Freight+Insurance+Customs+...) كتتوزع على أسطر طلب الشراء **بالتناسب مع قيمة كل سطر** (`الكمية × سعر الشراء`)، ثم تتحول لتكلفة إضافية للوحدة.
- **✅ تحقق رقمي مطابق تماماً للمثال المذكور فالمواصفات**: شراء 100 + تكاليف استيراد 27 = **127 تكلفة حقيقية بالضبط** — وحتى الهامش (بيع بـ170 = **25.29% هامش**) تحقق منه الاختبار رقمياً بدقة عشرية.
- **التوزيع النسبي مُختبر بمثال متعدد الأسطر**: سطر بقيمة 80% من الإجمالي ياخذ 80% من التكاليف، والباقي 20% للسطر الآخر — بدقة كاملة.

### الربط مع Average Cost (يُحسّن PHASE 8)
- **`close()`**: عند إغلاق ملف الاستيراد، `Product.averageCost` كيتحدث بـ**التكلفة الحقيقية الكاملة** (شراء + تكاليف استيراد موزعة) وليس فقط سعر الشراء الخام — نفس معادلة weighted average المستعملة فـ`PurchasesService.receive()`، لكن دابا بمدخل أدق. **مُختبر صراحة** أن `averageCost` النهائي هو 127 وليس 100.
- منع إغلاق ملف مُغلق مسبقاً.

### API
```
GET/POST /api/imports
POST     /api/imports/:id/expenses      [imports.edit]
GET      /api/imports/:id/landed-cost   [imports.view]
POST     /api/imports/:id/advance/:status [imports.edit]
POST     /api/imports/:id/close         [imports.close]
```
(كل الصلاحيات `imports.*` كانت موجودة مسبقاً فكتالوج PHASE 5 — بلا حاجة لإضافة جديدة.)

### Frontend (`/imports`)
- جدول ملفات الاستيراد + مسار حالة حي (11 خطوة).
- **جدول Landed Cost حي**: يبين لكل منتج تكلفة الشراء، حصة التكاليف الموزعة، التكلفة الحقيقية النهائية، والهامش المتوقع عند البيع — كل هذا محسوب لحظياً من `/api/imports/:id/landed-cost` بدون انتظار الإغلاق.
- زر "إغلاق الملف" بتحذير صريح أنه سيحدّث تكلفة المنتجات نهائياً.

## التحقق (تم تشغيله فعلياً)
```
Backend:  npx jest        → 127/127 tests ناجحة (12 اختبار جديد)
Backend:  npx tsc --noEmit → صفر أخطاء
Frontend: npx next build  → ✓ Compiled, 11 صفحة, صفر أخطاء TypeScript
```

## القيود المتبقية (موثقة بوعي)
- **طرق التوزيع الأخرى** (By Quantity, By Weight, By Volume, Manual من PHASE 17) — غير مبنية، فقط "By Value" (الطريقة الافتراضية وهي المستعملة فالمثال الرسمي).
- **العملات المتعددة على مستوى Import Expenses**: التكاليف تفترض نفس عملة طلب الشراء (بدون تحويل أسعار صرف تلقائي).
- **Import Documents** (Commercial Invoice, Packing List, Certificate of Origin, BL...) — حقول نصية بسيطة (`blNumber`, `containerNumber`) موجودة، لكن رفع/تخزين المستندات الفعلية (PHASE 54 File Management) غير مبني.

## ✅ حالة الـ Backlog بعد هاد الإصلاح
**كل الفجوات ذات الأولوية العالية من `FULL-SYSTEM-AUDIT.md` مُصلحة**:
- ✅ Stock Reservations
- ✅ Supplier Bills/Payments
- ✅ Import Management + True Landed Cost

المتبقي فالـ backlog دابا من الأولوية المتوسطة/المنخفضة فقط (Product Variants، RFQ، PDF documents، Excel import/export، MFA...).
