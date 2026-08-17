import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StockService } from '../stock/stock.service';
import { FinanceService } from '../finance/finance.service';
import { CreateSalesOrderDto } from './dto/sales.dto';

const ORDER_INCLUDE = {
  customer: true,
  items: { include: { product: true, variant: true } },
} as const;

function computeMargin(unitPrice: number, unitCost: number): number {
  if (unitPrice <= 0) return 0;
  return ((unitPrice - unitCost) / unitPrice) * 100;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly finance: FinanceService,
  ) {}

  async list(companyId: string) {
    return this.prisma.salesOrder.findMany({
      where: { companyId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(companyId: string, id: string) {
    const order = await this.prisma.salesOrder.findFirst({ where: { id, companyId }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('طلب البيع غير موجود');
    return order;
  }

  // ---------------------------------------------------------------
  // CREATE QUOTATION (PHASE 24) — with Minimum Margin Protection (PHASE 26)
  // ---------------------------------------------------------------
  async create(companyId: string, actorId: string, dto: CreateSalesOrderDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, companyId } });
    if (!customer) throw new NotFoundException('العميل غير موجود');

    if (!dto.items?.length) throw new BadRequestException('يجب إضافة منتج واحد على الأقل');

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds }, companyId, deletedAt: null } });
    if (products.length !== new Set(productIds).size) {
      throw new NotFoundException('منتج واحد أو أكثر غير موجود فهذه الشركة');
    }
    const productById = new Map<string, any>(products.map((p: any) => [p.id, p]));

    // Validate any variantId belongs to its declared product & tenant, and
    // preload variants so per-SKU cost overrides (PHASE 9) can be applied.
    const variantIds = dto.items.map((i) => i.variantId).filter((v): v is string => !!v);
    const variants = variantIds.length
      ? await this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } })
      : [];
    const variantById = new Map<string, any>(variants.map((v: any) => [v.id, v]));
    for (const item of dto.items) {
      if (!item.variantId) continue;
      const variant = variantById.get(item.variantId);
      if (!variant || variant.productId !== item.productId) {
        throw new NotFoundException('التركيبة (Variant) غير موجودة لهذا المنتج');
      }
    }

    // Minimum Margin Protection: any line selling below the product's
    // configured minimum margin requires an explicit authorization reason,
    // logged to the audit trail with actor/price/cost/margin (PHASE 26).
    const belowMinMargin: { productId: string; margin: number; minRequired: number }[] = [];
    for (const item of dto.items) {
      const product = productById.get(item.productId)!;
      const variant = item.variantId ? variantById.get(item.variantId) : null;
      const cost = variant?.purchaseCost ?? product.averageCost ?? product.lastCost ?? product.purchaseCost ?? 0;
      const margin = computeMargin(item.unitPrice, cost);
      if (product.minMarginPercent != null && margin < product.minMarginPercent) {
        belowMinMargin.push({ productId: item.productId, margin, minRequired: product.minMarginPercent });
      }
    }
    if (belowMinMargin.length > 0 && !dto.marginOverrideReason) {
      throw new ForbiddenException({
        message: 'AUTHORIZATION REQUIRED — سعر البيع تحت الهامش الأدنى المسموح لمنتج واحد أو أكثر',
        belowMinMargin,
      });
    }

    const order = await this.prisma.salesOrder.create({
      data: {
        companyId,
        customerId: dto.customerId,
        salesRepId: actorId,
        notes: dto.notes,
        status: 'QUOTATION',
        items: {
          create: dto.items.map((item) => {
            const product = productById.get(item.productId)!;
            const variant = item.variantId ? variantById.get(item.variantId) : null;
            const cost = variant?.purchaseCost ?? product.averageCost ?? product.lastCost ?? product.purchaseCost ?? 0;
            return {
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: cost,
              discountPercent: item.discountPercent ?? 0,
            };
          }),
        },
      },
      include: ORDER_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        companyId,
        userId: actorId,
        action: 'CREATE',
        entity: 'SalesOrder',
        entityId: order.id,
        newValue: {
          customerId: dto.customerId,
          itemCount: dto.items.length,
          marginOverrideReason: dto.marginOverrideReason,
          belowMinMargin: belowMinMargin.length ? belowMinMargin : undefined,
        },
      },
    });

    return order;
  }

  // ---------------------------------------------------------------
  // STATUS TRANSITIONS (PHASE 24)
  // QUOTATION -> READY -> PICKING -> PACKED -> DISPATCHED -> DELIVERED -> INVOICED
  // ---------------------------------------------------------------
  private readonly FORWARD_TRANSITIONS: Record<string, string[]> = {
    QUOTATION: ['READY', 'CANCELLED'],
    READY: ['PICKING', 'CANCELLED'],
    PICKING: ['PACKED', 'CANCELLED'],
    PACKED: ['DISPATCHED'],
    DISPATCHED: ['DELIVERED'],
    DELIVERED: ['INVOICED'],
    INVOICED: [],
    CANCELLED: [],
  };

  async confirm(companyId: string, actorId: string, id: string) {
    const order = await this.findOne(companyId, id);
    if (order.status !== 'QUOTATION') {
      throw new BadRequestException(`لا يمكن الانتقال من ${order.status} إلى READY`);
    }

    // Reserve stock the moment the order is confirmed — not just at delivery
    // (closes the double-sell gap, docs/FULL-SYSTEM-AUDIT.md §5). All-or-
    // nothing: if any line can't be reserved, roll back whatever was already
    // reserved for this order before surfacing the error.
    try {
      for (const item of order.items) {
        await this.stock.reserve(companyId, id, item.productId, item.quantity, item.variantId ?? undefined);
      }
    } catch (err) {
      await this.stock.releaseReservationsForOrder(companyId, id);
      throw err;
    }

    return this.transition(companyId, actorId, id, 'READY');
  }

  async cancel(companyId: string, actorId: string, id: string) {
    const cancelled = await this.transition(companyId, actorId, id, 'CANCELLED');
    // release any stock reserved while this order was QUOTATION/READY
    await this.stock.releaseReservationsForOrder(companyId, id);
    return cancelled;
  }

  async advance(companyId: string, actorId: string, id: string, targetStatus: string) {
    return this.transition(companyId, actorId, id, targetStatus);
  }

  private async transition(companyId: string, actorId: string, id: string, targetStatus: string) {
    const order = await this.findOne(companyId, id);
    const allowed = this.FORWARD_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(`لا يمكن الانتقال من ${order.status} إلى ${targetStatus}`);
    }

    const updated = await this.prisma.salesOrder.update({
      where: { id },
      data: { status: targetStatus as any },
      include: ORDER_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        companyId, userId: actorId, action: 'UPDATE', entity: 'SalesOrder', entityId: id,
        oldValue: { status: order.status }, newValue: { status: targetStatus },
      },
    });

    return updated;
  }

  // ---------------------------------------------------------------
  // DELIVER — moves the order to DISPATCHED->DELIVERED AND records real
  // stock-out movements (SALE type) through StockService, so on-hand
  // actually decreases. Reuses StockService's own negative-stock guard.
  // ---------------------------------------------------------------
  async deliver(companyId: string, actorId: string, actorPermissions: string[], isSuperAdmin: boolean, id: string, warehouseId: string) {
    const order = await this.findOne(companyId, id);
    if (order.status !== 'PACKED' && order.status !== 'DISPATCHED') {
      throw new BadRequestException('الطلب يجب أن يكون معبأ (PACKED) أو مُرسل (DISPATCHED) قبل التسليم');
    }

    for (const item of order.items) {
      await this.stock.recordMovement(companyId, actorId, actorPermissions, isSuperAdmin, {
        productId: item.productId,
        variantId: item.variantId ?? undefined,
        warehouseId,
        type: 'SALE',
        quantity: -item.quantity,
        referenceDocument: order.id,
        reason: `تسليم طلب البيع ${order.id}`,
      } as any);
    }

    return this.prisma.salesOrder.update({
      where: { id },
      data: { status: 'DELIVERED', warehouseId },
      include: ORDER_INCLUDE,
    }).then(async (updated: any) => {
      // the sale is now a real ledger movement — release the reservation so
      // it isn't double-counted against on-hand going forward.
      await this.stock.releaseReservationsForOrder(companyId, id);
      return updated;
    });
  }

  async invoice(companyId: string, actorId: string, id: string) {
    const order = await this.transition(companyId, actorId, id, 'INVOICED');
    // Real invoice generation (PHASE 34) — traceable to this exact order,
    // with its item-level cost snapshots preserved for true-margin reporting.
    const invoiceRecord = await this.finance.createInvoiceFromOrder(companyId, order);
    return { order, invoice: invoiceRecord };
  }

  // ---------------------------------------------------------------
  // MARGIN REPORTING (true margin per PHASE 17/26 — based on cost
  // snapshot at order time, not current cost)
  // ---------------------------------------------------------------
  computeOrderMargin(order: { items: { quantity: number; unitPrice: number; unitCost: number }[] }) {
    const revenue = order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const cost = order.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
    const grossProfit = revenue - cost;
    const marginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    return { revenue, cost, grossProfit, marginPercent };
  }
}
