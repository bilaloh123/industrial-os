import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateWarehouseDto, CreateZoneDto, CreateRackDto, CreateShelfDto, CreateBinDto, RecordMovementDto } from './dto/stock.dto';

// Maps each ledger movement type to the granular permission required to
// record it (PHASE 5). Enforced here — in addition to route-level guards —
// because a single POST /api/stock/movements endpoint accepts several
// movement types, each with a different required permission.
const MOVEMENT_PERMISSION: Record<string, string> = {
  PURCHASE_RECEIPT: 'stock.receive',
  RETURN_IN: 'stock.receive',
  TRANSFER: 'stock.transfer',
  ADJUSTMENT: 'stock.adjust',
  DAMAGE: 'stock.adjust',
  LOSS: 'stock.adjust',
  INVENTORY_COUNT: 'stock.count',
  SALE: 'stock.adjust',
  RETURN_OUT: 'stock.adjust',
  INTERNAL_USE: 'stock.adjust',
};

export type StockHealth = 'GREEN' | 'ORANGE' | 'RED' | 'BLACK';

function computeHealth(onHand: number, reorderPoint: number, safetyStock: number): StockHealth {
  if (onHand <= 0) return 'BLACK';
  if (onHand <= safetyStock) return 'RED';
  if (onHand <= reorderPoint) return 'ORANGE';
  return 'GREEN';
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // WAREHOUSES + HIERARCHY (PHASE 18)
  // ---------------------------------------------------------------
  listWarehouses(companyId: string) {
    return this.prisma.warehouse.findMany({
      where: { companyId },
      include: { zones: { include: { racks: { include: { shelves: { include: { bins: true } } } } } } },
      orderBy: { name: 'asc' },
    });
  }

  async createWarehouse(companyId: string, dto: CreateWarehouseDto) {
    const existing = await this.prisma.warehouse.findUnique({
      where: { companyId_code: { companyId, code: dto.code } },
    });
    if (existing) throw new ConflictException('رمز المستودع مستخدم بالفعل');
    return this.prisma.warehouse.create({ data: { companyId, ...dto } });
  }

  private async assertWarehouseInTenant(companyId: string, warehouseId: string) {
    const wh = await this.prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } });
    if (!wh) throw new NotFoundException('المستودع غير موجود');
    return wh;
  }

  async createZone(companyId: string, warehouseId: string, dto: CreateZoneDto) {
    await this.assertWarehouseInTenant(companyId, warehouseId);
    const existing = await this.prisma.warehouseZone.findUnique({
      where: { warehouseId_code: { warehouseId, code: dto.code } },
    });
    if (existing) throw new ConflictException('رمز المنطقة مستخدم بالفعل فهذا المستودع');
    return this.prisma.warehouseZone.create({ data: { warehouseId, ...dto } });
  }

  private async assertZoneInTenant(companyId: string, zoneId: string) {
    const zone = await this.prisma.warehouseZone.findFirst({
      where: { id: zoneId, warehouse: { companyId } },
    });
    if (!zone) throw new NotFoundException('المنطقة غير موجودة');
    return zone;
  }

  async createRack(companyId: string, zoneId: string, dto: CreateRackDto) {
    await this.assertZoneInTenant(companyId, zoneId);
    const existing = await this.prisma.rack.findUnique({ where: { zoneId_code: { zoneId, code: dto.code } } });
    if (existing) throw new ConflictException('رمز الرف مستخدم بالفعل فهذه المنطقة');
    return this.prisma.rack.create({ data: { zoneId, ...dto } });
  }

  private async assertRackInTenant(companyId: string, rackId: string) {
    const rack = await this.prisma.rack.findFirst({ where: { id: rackId, zone: { warehouse: { companyId } } } });
    if (!rack) throw new NotFoundException('الرف غير موجود');
    return rack;
  }

  async createShelf(companyId: string, rackId: string, dto: CreateShelfDto) {
    await this.assertRackInTenant(companyId, rackId);
    const existing = await this.prisma.shelf.findUnique({ where: { rackId_code: { rackId, code: dto.code } } });
    if (existing) throw new ConflictException('رمز الطابق مستخدم بالفعل فهذا الرف');
    return this.prisma.shelf.create({ data: { rackId, ...dto } });
  }

  private async assertShelfInTenant(companyId: string, shelfId: string) {
    const shelf = await this.prisma.shelf.findFirst({
      where: { id: shelfId, rack: { zone: { warehouse: { companyId } } } },
    });
    if (!shelf) throw new NotFoundException('الطابق غير موجود');
    return shelf;
  }

  async createBin(companyId: string, shelfId: string, dto: CreateBinDto) {
    await this.assertShelfInTenant(companyId, shelfId);
    const existing = await this.prisma.bin.findUnique({ where: { shelfId_code: { shelfId, code: dto.code } } });
    if (existing) throw new ConflictException('رمز الموقع مستخدم بالفعل فهذا الطابق');
    return this.prisma.bin.create({ data: { shelfId, ...dto } });
  }

  // ---------------------------------------------------------------
  // ON-HAND CALCULATION — always derived from the ledger, never a
  // separately stored/editable counter (PHASE 19-20). An optional
  // variantId scopes the calculation to a single ProductVariant SKU
  // (PHASE 9) — when omitted, every movement for the product counts,
  // regardless of variant, preserving prior behavior for non-variant
  // products.
  // ---------------------------------------------------------------
  async getOnHand(companyId: string, productId: string, warehouseId?: string, variantId?: string): Promise<number> {
    const agg = await this.prisma.stockMovement.aggregate({
      where: { companyId, productId, ...(warehouseId ? { warehouseId } : {}), ...(variantId ? { variantId } : {}) },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  }

  // ---------------------------------------------------------------
  // RESERVATIONS — closes the double-sell gap (docs/FULL-SYSTEM-AUDIT.md §5).
  // Available = On Hand - active Reservations (PHASE 20).
  // ---------------------------------------------------------------
  async getReserved(companyId: string, productId: string, variantId?: string): Promise<number> {
    const agg = await this.prisma.stockReservation.aggregate({
      where: { companyId, productId, releasedAt: null, ...(variantId ? { variantId } : {}) },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  }

  async getAvailable(companyId: string, productId: string, variantId?: string): Promise<number> {
    const [onHand, reserved] = await Promise.all([
      this.getOnHand(companyId, productId, undefined, variantId),
      this.getReserved(companyId, productId, variantId),
    ]);
    return onHand - reserved;
  }

  /** Reserves stock for a sales order line. Throws if not enough is
   * available (on-hand minus what's already reserved by other orders).
   * When variantId is given, availability is checked against that exact
   * SKU's own pool rather than the product's combined stock. */
  async reserve(companyId: string, salesOrderId: string, productId: string, quantity: number, variantId?: string) {
    const available = await this.getAvailable(companyId, productId, variantId);
    if (quantity > available) {
      throw new BadRequestException(
        `الكمية المطلوب حجزها (${quantity}) تفوق المتوفر الفعلي (${available} — بعد خصم الحجوزات النشطة الأخرى)`,
      );
    }
    return this.prisma.stockReservation.create({
      data: { companyId, salesOrderId, productId, quantity, variantId },
    });
  }

  /** Releases every still-active reservation tied to an order — called on
   * cancellation, or right after delivery converts the reservation into a
   * real stock movement (so it's not double-counted against on-hand). */
  async releaseReservationsForOrder(companyId: string, salesOrderId: string) {
    return this.prisma.stockReservation.updateMany({
      where: { companyId, salesOrderId, releasedAt: null },
      data: { releasedAt: new Date() },
    });
  }

  // ---------------------------------------------------------------
  // RECORD MOVEMENT (PHASE 19) — append-only. No update/delete exposed.
  // ---------------------------------------------------------------
  async recordMovement(
    companyId: string,
    actorId: string,
    actorPermissions: string[],
    isSuperAdmin: boolean,
    dto: RecordMovementDto,
  ) {
    const requiredPermission = MOVEMENT_PERMISSION[dto.type];
    if (!isSuperAdmin && !actorPermissions.includes(requiredPermission)) {
      throw new ForbiddenException(`صلاحية "${requiredPermission}" مطلوبة لتسجيل حركة من نوع ${dto.type}`);
    }

    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, companyId, deletedAt: null } });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findFirst({ where: { id: dto.variantId, productId: dto.productId } });
      if (!variant) throw new NotFoundException('التركيبة (Variant) غير موجودة لهذا المنتج');
    }
    await this.assertWarehouseInTenant(companyId, dto.warehouseId);
    if (dto.binId) {
      const bin = await this.prisma.bin.findFirst({
        where: { id: dto.binId, shelf: { rack: { zone: { warehouse: { companyId } } } } },
      });
      if (!bin) throw new NotFoundException('الموقع (Bin) غير موجود');
    }

    // outgoing movement must not push on-hand below zero
    if (dto.quantity < 0) {
      const onHand = await this.getOnHand(companyId, dto.productId, dto.warehouseId, dto.variantId);
      if (onHand + dto.quantity < 0) {
        throw new BadRequestException(
          `الكمية المطلوبة (${Math.abs(dto.quantity)}) تفوق المتوفر فهذا المستودع (${onHand})`,
        );
      }
    }

    return this.prisma.stockMovement.create({
      data: { companyId, userId: actorId, ...dto },
      include: { product: true, warehouse: true, bin: true },
    });
  }

  async listMovements(companyId: string, filters: { productId?: string; warehouseId?: string }) {
    return this.prisma.stockMovement.findMany({
      where: { companyId, ...filters },
      include: { product: true, warehouse: true, bin: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ---------------------------------------------------------------
  // STOCK HEALTH SUMMARY (PHASE 20)
  // ---------------------------------------------------------------
  async getStockSummary(companyId: string) {
    const products = await this.prisma.product.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, internalRef: true, name: true, reorderPoint: true, safetyStock: true },
    });

    const [movementGroups, reservationGroups] = await Promise.all([
      this.prisma.stockMovement.groupBy({ by: ['productId'], where: { companyId }, _sum: { quantity: true } }),
      this.prisma.stockReservation.groupBy({
        by: ['productId'],
        where: { companyId, releasedAt: null },
        _sum: { quantity: true },
      }),
    ]);
    const onHandByProduct = new Map<string, number>(movementGroups.map((g: any) => [g.productId, g._sum.quantity ?? 0]));
    const reservedByProduct = new Map<string, number>(reservationGroups.map((g: any) => [g.productId, g._sum.quantity ?? 0]));

    return products.map((p: any) => {
      const onHand: number = onHandByProduct.get(p.id) ?? 0;
      const reserved: number = reservedByProduct.get(p.id) ?? 0;
      const available = onHand - reserved;
      return {
        productId: p.id,
        internalRef: p.internalRef,
        name: p.name,
        onHand,
        reserved,
        available,
        reorderPoint: p.reorderPoint,
        safetyStock: p.safetyStock,
        health: computeHealth(available, p.reorderPoint, p.safetyStock),
      };
    });
  }

  // ---------------------------------------------------------------
  // PER-VARIANT STOCK (PHASE 9 + PHASE 20) — same product can have several
  // SKUs; each is tracked as its own independent pool of on-hand/reserved
  // stock, distinct from the parent product's own (non-variant) movements.
  // ---------------------------------------------------------------
  async getVariantStockSummary(companyId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, companyId, deletedAt: null } });
    if (!product) throw new NotFoundException('المنتج غير موجود');

    const variants = await this.prisma.productVariant.findMany({ where: { productId }, orderBy: { sku: 'asc' } });

    return Promise.all(
      variants.map(async (v: any) => {
        const onHand = await this.getOnHand(companyId, productId, undefined, v.id);
        const reserved = await this.getReserved(companyId, productId, v.id);
        return {
          variantId: v.id,
          sku: v.sku,
          onHand,
          reserved,
          available: onHand - reserved,
        };
      }),
    );
  }
}
