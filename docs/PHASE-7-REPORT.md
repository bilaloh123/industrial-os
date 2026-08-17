# تقرير PHASE 7 — Warehouse / Inventory Engine

## 1. ما تم بناؤه

### Database
جداول جديدة تطابق الترتيب الهرمي المطلوب حرفياً (PHASE 18): `warehouses` → `warehouse_zones` → `racks` → `shelves` → `bins`، بالإضافة لـ `stock_movements` (Inventory Ledger).

- **Inventory Ledger حقيقي append-only** (PHASE 19): `StockMovement` بدون أي `update`/`delete` endpoint مكشوف — الرصيد الحالي محسوب دائماً من `SUM(quantity)` على الحركات، وليس عداد منفصل قابل للتعديل مباشرة. أي تصحيح = حركة جديدة، بالضبط كما طُلب.
- 10 أنواع حركة مطابقة للمواصفات بالحرف: `PURCHASE_RECEIPT, SALE, RETURN_IN, RETURN_OUT, TRANSFER, ADJUSTMENT, DAMAGE, LOSS, INVENTORY_COUNT, INTERNAL_USE`.

### منطق الأعمال المهم
- **RBAC حسب نوع الحركة** (وليس صلاحية واحدة عامة): تسجيل `PURCHASE_RECEIPT` يحتاج `stock.receive`، `TRANSFER` يحتاج `stock.transfer`، `ADJUSTMENT/DAMAGE/LOSS` تحتاج `stock.adjust`، `INVENTORY_COUNT` يحتاج `stock.count` — مطبّق داخل الـ service نفسه (مو غير route guard عام)، لأن endpoint واحد `POST /api/stock/movements` يستقبل كل الأنواع.
- **منع الرصيد السالب**: أي حركة صادرة (quantity سالبة) تُرفض إذا كانت غادي تخلي الرصيد المتوفر أقل من صفر — الاستثناء الوحيد ماكاينش، لأن حتى `ADJUSTMENT` بالسالب لازم يحترم الرصيد الحقيقي.
- **صحة المخزون (Stock Health — PHASE 20)**: 4 مستويات محسوبة تلقائياً من `onHand` مقابل `reorderPoint` و`safetyStock` للمنتج: `GREEN` (فوق نقطة الطلب)، `ORANGE` (بين مخزون الأمان ونقطة الطلب)، `RED` (تحت مخزون الأمان لكن >0)، `BLACK` (نفد تماماً).

### API (`/api/stock/*`)
```
GET/POST /api/stock/warehouses
POST     /api/stock/warehouses/:id/zones
POST     /api/stock/zones/:id/racks
POST     /api/stock/racks/:id/shelves
POST     /api/stock/shelves/:id/bins
GET/POST /api/stock/movements
GET      /api/stock/summary          # صحة المخزون لكل المنتجات
```
كل مستوى فالهرمية يتحقق من tenant isolation عبر سلسلة العلاقات كاملة (مثلاً bin ← shelf ← rack ← zone ← warehouse ← companyId).

### Frontend (`/stock`)
3 تبويبات متصلة بالباك اند الحقيقي:
- **صحة المخزون**: جدول بالألوان (أخضر/برتقالي/أحمر/رمادي) لكل منتج
- **حركات المخزون**: سجل حي، مع ملاحظة صريحة "سجل غير قابل للتعديل"
- **المستودعات**: بطاقات لكل مستودع
- **Modal تسجيل حركة**: يحدد تلقائياً إشارة الكمية (+/-) حسب نوع الحركة المختار

## 2. التحقق (تم تشغيله فعلياً)
```
Backend:  npx jest        → 52/52 tests ناجحة (12 اختبار جديد للمخزون)
Backend:  npx tsc --noEmit → صفر أخطاء
Frontend: npx next build  → ✓ Compiled, 9 صفحات, صفر أخطاء TypeScript
```

تفصيل اختبارات Stock (`test/stock.service.spec.ts`):
- **`getOnHand()`**: الحساب الصحيح من الـ ledger، إرجاع 0 (وليس null) لمنتج بدون حركات.
- **RBAC حسب النوع**: رفض `WAREHOUSE_OPERATOR` بدون `stock.adjust` من تسجيل `ADJUSTMENT`، قبول `PURCHASE_RECEIPT` بـ`stock.receive` فقط، تجاوز SUPER_ADMIN لكل الفحوصات.
- **منع الرصيد السالب**: رفض حركة صادرة تفوق المتوفر، قبول حركة تُصفّر الرصيد بالضبط (edge case).
- **Tenant isolation**: رفض حركة على منتج أو مستودع من شركة أخرى.
- **صحة المخزون**: تصنيف صحيح للـ4 مستويات + حالة منتج جديد بدون حركات (BLACK، مو خطأ).

## 3. القيود
- **الحجز (Stock Reservations)**: العمود `Available = On Hand - Reserved` المذكور فـ PHASE 20 لم يُبنَ بعد — يحتاج جدول `stock_reservations` منفصل، سيُبنى طبيعياً مع PHASE 11 (Sales) لما تصير الطلبات كتحجز مخزون فعلياً.
- **Stock Transfers workflow** (Request → Approval → Picking → Transfer → Confirmation من PHASE 21) — حالياً `TRANSFER` مجرد نوع حركة بسيط، بدون سير عمل موافقات. سيُبنى عند الحاجة الفعلية.
- **Inventory Count workflow كامل** (Create → Count → Compare → Variance → Approval → Adjustment من PHASE 22) — حالياً `INVENTORY_COUNT` نوع حركة بسيط بدون واجهة جرد مخصصة.
- لا واجهة لإنشاء Warehouse/Zone/Rack/Shelf/Bin من الأدمن بعد (الـ API جاهز بالكامل).

## ✅ حالة PHASE 7: مكتمل (النواة الأساسية)
Database (هرمية كاملة) ✔ Inventory Ledger append-only ✔ RBAC دقيق حسب نوع الحركة ✔ منع رصيد سالب ✔ صحة المخزون ✔ Frontend متصل ✔ Tests ✔ (52/52) ✔ Build ✔

**جاهزين لـ PHASE 11 (Sales) — أول module كيربط Products+Stock بعملية بيع حقيقية، أو PHASE 12 (Customers/Suppliers) إذا فضّلتو نبنيو الأطراف قبل العمليات.**
