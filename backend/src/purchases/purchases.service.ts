import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StockService } from '../stock/stock.service';
import { FinanceService } from '../finance/finance.service';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto } from './dto/purchases.dto';

const PO_INCLUDE = {
  supplier: true,
  items: { include: { product: true, variant: true } },
} as const;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly finance: FinanceService,
  ) {}

  async list(companyId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { companyId },
      include: PO_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(companyId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId }, include: PO_INCLUDE });
    if (!po) throw new NotFoundException('طلب الشراء غير موجود');
    return po;
  }

  // ---------------------------------------------------------------
  // CREATE (DRAFT) — PHASE 14
  // ---------------------------------------------------------------
  async create(companyId: string, actorId: string, dto: CreatePurchaseOrderDto) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: dto.supplierId, companyId } });
    if (!supplier) throw new NotFoundException('المورد غير موجود');
    if (!dto.items?.length) throw new BadRequestException('يجب إضافة منتج واحد على الأقل');

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds }, companyId, deletedAt: null } });
    if (products.length !== new Set(productIds).size) {
      throw new NotFoundException('منتج واحد أو أكثر غير موجود فهذه الشركة');
    }

    const variantIds = dto.items.map((i) => i.variantId).filter((v): v is string => !!v);
    if (variantIds.length) {
      const variants = await this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } });
      const variantById = new Map<string, any>(variants.map((v: any) => [v.id, v]));
      for (const item of dto.items) {
        if (!item.variantId) continue;
        const variant = variantById.get(item.variantId);
        if (!variant || variant.productId !== item.productId) {
          throw new NotFoundException('التركيبة (Variant) غير موجودة لهذا المنتج');
        }
      }
    }

    const po = await this.prisma.purchaseOrder.create({
      data: {
        companyId,
        supplierId: dto.supplierId,
        currency: dto.currency ?? supplier.currency,
        exchangeRate: dto.exchangeRate ?? 1,
        notes: dto.notes,
        status: 'DRAFT',
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantityOrdered: i.quantityOrdered,
            unitCost: i.unitCost,
          })),
        },
      },
      include: PO_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: { companyId, userId: actorId, action: 'CREATE', entity: 'PurchaseOrder', entityId: po.id, newValue: { supplierId: dto.supplierId } },
    });

    return po;
  }

  // ---------------------------------------------------------------
  // DRAFT -> ORDERED
  // ---------------------------------------------------------------
  async order(companyId: string, actorId: string, id: string) {
    const po = await this.findOne(companyId, id);
    if (po.status !== 'DRAFT') throw new BadRequestException('فقط طلبات الشراء بحالة DRAFT يمكن تأكيدها');
    const updated = await this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'ORDERED' }, include: PO_INCLUDE });
    await this.prisma.auditLog.create({
      data: { companyId, userId: actorId, action: 'UPDATE', entity: 'PurchaseOrder', entityId: id, oldValue: { status: 'DRAFT' }, newValue: { status: 'ORDERED' } },
    });
    return updated;
  }

  async cancel(companyId: string, actorId: string, id: string) {
    const po = await this.findOne(companyId, id);
    if (!['DRAFT', 'ORDERED'].includes(po.status)) {
      throw new BadRequestException('لا يمكن إلغاء طلب شراء بدأ استلامه أو اكتمل');
    }
    const updated = await this.prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' }, include: PO_INCLUDE });
    await this.prisma.auditLog.create({
      data: { companyId, userId: actorId, action: 'UPDATE', entity: 'PurchaseOrder', entityId: id, reason: 'cancel' },
    });
    return updated;
  }

  // ---------------------------------------------------------------
  // RECEIVE — supports PARTIAL RECEIPTS (PHASE 14), records real stock-in
  // movements via StockService, and updates the product's weighted-average
  // cost (a simplified precursor to full Landed Cost allocation, PHASE 17).
  // ---------------------------------------------------------------
  async receive(
    companyId: string,
    actorId: string,
    actorPermissions: string[],
    isSuperAdmin: boolean,
    id: string,
    dto: ReceivePurchaseOrderDto,
  ) {
    if (!isSuperAdmin && !actorPermissions.includes('stock.receive')) {
      throw new ForbiddenException('صلاحية "stock.receive" مطلوبة لاستلام البضاعة');
    }

    const po = await this.findOne(companyId, id);
    if (!['ORDERED', 'RECEIVING'].includes(po.status)) {
      throw new BadRequestException('طلب الشراء يجب أن يكون بحالة ORDERED أو RECEIVING للاستلام');
    }
    if (!dto.lines?.length) throw new BadRequestException('يجب تحديد سطر استلام واحد على الأقل');

    const itemById = new Map<string, any>(po.items.map((i: any) => [i.id, i]));

    for (const line of dto.lines) {
      const item = itemById.get(line.itemId);
      if (!item) throw new NotFoundException(`سطر الطلب ${line.itemId} غير موجود فهذا الطلب`);
      const remaining = item.quantityOrdered - item.quantityReceived;
      if (line.quantity > remaining) {
        throw new BadRequestException(
          `الكمية المستلمة (${line.quantity}) تفوق المتبقي فسطر ${item.product.internalRef} (${remaining})`,
        );
      }
    }

    for (const line of dto.lines) {
      const item = itemById.get(line.itemId);

      // real stock-in movement — reuses the same ledger + guard used everywhere else
      await this.stock.recordMovement(companyId, actorId, actorPermissions, isSuperAdmin, {
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        warehouseId: dto.warehouseId,
        type: 'PURCHASE_RECEIPT',
        quantity: line.quantity,
        referenceDocument: po.id,
        reason: `استلام طلب الشراء ${po.id}`,
      } as any);

      // weighted-average cost update (simplified landed-cost precursor).
      // A line ordering a specific variant (PHASE 9) updates that SKU's own
      // cost in isolation; a line without a variant updates the product's
      // general average as before.
      if (item.variantId) {
        const onHandBefore = await this.stock.getOnHand(companyId, item.productId, undefined, item.variantId);
        const priorOnHand = onHandBefore - line.quantity;
        const variant = await this.prisma.productVariant.findUnique({ where: { id: item.variantId } });
        const priorAvg = variant?.purchaseCost ?? item.unitCost;
        const newAvg = priorOnHand > 0
          ? (priorAvg * priorOnHand + item.unitCost * line.quantity) / (priorOnHand + line.quantity)
          : item.unitCost;
        await this.prisma.productVariant.update({ where: { id: item.variantId }, data: { purchaseCost: newAvg } });
      } else {
        const onHandBefore = await this.stock.getOnHand(companyId, item.productId);
        const priorOnHand = onHandBefore - line.quantity; // movement already recorded above
        const priorProduct = await this.prisma.product.findUnique({ where: { id: item.productId } });
        const priorAvg = priorProduct?.averageCost ?? item.unitCost;
        const newAvg = priorOnHand > 0
          ? (priorAvg * priorOnHand + item.unitCost * line.quantity) / (priorOnHand + line.quantity)
          : item.unitCost;

        await this.prisma.product.update({
          where: { id: item.productId },
          data: { averageCost: newAvg, lastCost: item.unitCost },
        });
      }

      await this.prisma.purchaseOrderItem.update({
        where: { id: item.id },
        data: { quantityReceived: { increment: line.quantity } },
      });
    }

    const refreshedItems = await this.prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const fullyReceived = refreshedItems.every((i: any) => i.quantityReceived >= i.quantityOrdered);

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: fullyReceived ? 'RECEIVED' : 'RECEIVING', warehouseId: dto.warehouseId },
      include: PO_INCLUDE,
    });

    // Real supplier bill generation (closes docs/FULL-SYSTEM-AUDIT.md §5
    // "Supplier Bills/Payments" gap) — only once, when the order is fully
    // received, mirroring how a customer invoice is generated on delivery.
    if (fullyReceived) {
      await this.finance.createBillFromPurchaseOrder(companyId, updated);
    }

    await this.prisma.auditLog.create({
      data: {
        companyId, userId: actorId, action: 'UPDATE', entity: 'PurchaseOrder', entityId: id,
        newValue: { received: dto.lines, status: updated.status },
      },
    });

    return updated;
  }
}
