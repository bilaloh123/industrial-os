import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { StockService } from '../src/stock/stock.service';
import { PrismaService } from '../src/prisma.service';

describe('StockService', () => {
  let service: StockService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      warehouse: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      warehouseZone: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      rack: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      shelf: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      bin: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      product: { findFirst: jest.fn(), findMany: jest.fn() },
      productVariant: { findFirst: jest.fn(), findMany: jest.fn() },
      stockMovement: { aggregate: jest.fn(), create: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
      stockReservation: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        create: jest.fn(),
        updateMany: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [StockService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(StockService);
  });

  describe('getOnHand()', () => {
    it('sums ledger movements for a product, scoped to the caller company', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 340 } });
      const onHand = await service.getOnHand('company_A', 'prod_1');
      expect(onHand).toBe(340);
      expect(prisma.stockMovement.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'company_A', productId: 'prod_1' }) }),
      );
    });

    it('returns 0 when there are no movements yet (not null/undefined)', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: null } });
      expect(await service.getOnHand('company_A', 'prod_new')).toBe(0);
    });
  });

  describe('recordMovement() — RBAC per movement type (PHASE 5/19)', () => {
    const baseDto = { productId: 'prod_1', warehouseId: 'wh_1', type: 'ADJUSTMENT', quantity: 5 } as any;

    it('rejects a WAREHOUSE_OPERATOR without stock.adjust from recording an ADJUSTMENT', async () => {
      await expect(
        service.recordMovement('company_A', 'user_1', ['stock.view', 'stock.receive'], false, baseDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('allows a PURCHASE_RECEIPT with stock.receive even without stock.adjust', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
      prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh_1' });
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
      prisma.stockMovement.create.mockResolvedValue({ id: 'mv_1' });

      await service.recordMovement(
        'company_A', 'user_1', ['stock.receive'], false,
        { productId: 'prod_1', warehouseId: 'wh_1', type: 'PURCHASE_RECEIPT', quantity: 80 } as any,
      );
      expect(prisma.stockMovement.create).toHaveBeenCalled();
    });

    it('always allows SUPER_ADMIN regardless of permissions array', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
      prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh_1' });
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 100 } });
      prisma.stockMovement.create.mockResolvedValue({ id: 'mv_2' });

      await service.recordMovement('company_A', 'user_1', [], true, baseDto);
      expect(prisma.stockMovement.create).toHaveBeenCalled();
    });
  });

  describe('recordMovement() — negative stock prevention (PHASE 20)', () => {
    it('rejects an outgoing movement that would push on-hand below zero', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
      prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh_1' });
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 4 } }); // only 4 on hand

      await expect(
        service.recordMovement(
          'company_A', 'user_1', ['stock.adjust'], false,
          { productId: 'prod_1', warehouseId: 'wh_1', type: 'ADJUSTMENT', quantity: -10 } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.stockMovement.create).not.toHaveBeenCalled();
    });

    it('allows an outgoing movement that exactly zeroes the stock', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
      prisma.warehouse.findFirst.mockResolvedValue({ id: 'wh_1' });
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 10 } });
      prisma.stockMovement.create.mockResolvedValue({ id: 'mv_3' });

      await service.recordMovement(
        'company_A', 'user_1', ['stock.adjust'], false,
        { productId: 'prod_1', warehouseId: 'wh_1', type: 'ADJUSTMENT', quantity: -10 } as any,
      );
      expect(prisma.stockMovement.create).toHaveBeenCalled();
    });
  });

  describe('recordMovement() — tenant isolation', () => {
    it('rejects a movement for a product belonging to a different company', async () => {
      prisma.product.findFirst.mockResolvedValue(null); // tenant-scoped lookup found nothing
      await expect(
        service.recordMovement(
          'company_A', 'user_1', ['stock.adjust'], false,
          { productId: 'prod_from_company_B', warehouseId: 'wh_1', type: 'ADJUSTMENT', quantity: 5 } as any,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a movement for a warehouse belonging to a different company', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
      prisma.warehouse.findFirst.mockResolvedValue(null);
      await expect(
        service.recordMovement(
          'company_A', 'user_1', ['stock.adjust'], false,
          { productId: 'prod_1', warehouseId: 'wh_from_company_B', type: 'ADJUSTMENT', quantity: 5 } as any,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createWarehouse()', () => {
    it('rejects a duplicate warehouse code within the same company', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.createWarehouse('company_A', { name: 'CASA', code: 'CASA' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('reserve() / getAvailable() / releaseReservationsForOrder() — Stock Reservations', () => {
    it('rejects reserving more than currently available (on-hand minus other active reservations)', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 100 } }); // 100 on hand
      prisma.stockReservation.aggregate.mockResolvedValue({ _sum: { quantity: 60 } }); // 60 already reserved by other orders
      // available = 100 - 60 = 40; requesting 50 should fail
      await expect(service.reserve('company_A', 'so_1', 'prod_1', 50)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.stockReservation.create).not.toHaveBeenCalled();
    });

    it('allows reserving exactly the available quantity (edge case)', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 100 } });
      prisma.stockReservation.aggregate.mockResolvedValue({ _sum: { quantity: 60 } });
      prisma.stockReservation.create.mockResolvedValue({ id: 'res_1' });

      await service.reserve('company_A', 'so_1', 'prod_1', 40); // exactly available
      expect(prisma.stockReservation.create).toHaveBeenCalledWith({
        data: { companyId: 'company_A', salesOrderId: 'so_1', productId: 'prod_1', quantity: 40 },
      });
    });

    it('computes available as on-hand minus only ACTIVE (non-released) reservations', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 200 } });
      prisma.stockReservation.aggregate.mockResolvedValue({ _sum: { quantity: 30 } });
      const available = await service.getAvailable('company_A', 'prod_1');
      expect(available).toBe(170);
      // must have queried only releasedAt: null reservations
      expect(prisma.stockReservation.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ releasedAt: null }) }),
      );
    });

    it('releases every active reservation for a given order (cancel or post-delivery cleanup)', async () => {
      prisma.stockReservation.updateMany.mockResolvedValue({ count: 2 });
      await service.releaseReservationsForOrder('company_A', 'so_1');
      expect(prisma.stockReservation.updateMany).toHaveBeenCalledWith({
        where: { companyId: 'company_A', salesOrderId: 'so_1', releasedAt: null },
        data: { releasedAt: expect.any(Date) },
      });
    });
  });

  describe('getStockSummary() — health thresholds (PHASE 20)', () => {
    it('classifies GREEN / ORANGE / RED / BLACK from AVAILABLE stock (on-hand minus reservations), not raw on-hand', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p_green', internalRef: 'A', name: 'A', reorderPoint: 50, safetyStock: 10 },
        { id: 'p_orange', internalRef: 'B', name: 'B', reorderPoint: 50, safetyStock: 10 },
        { id: 'p_red', internalRef: 'C', name: 'C', reorderPoint: 50, safetyStock: 10 },
        { id: 'p_black', internalRef: 'D', name: 'D', reorderPoint: 50, safetyStock: 10 },
      ]);
      prisma.stockMovement.groupBy.mockResolvedValue([
        { productId: 'p_green', _sum: { quantity: 340 } },  // > reorderPoint, no reservations
        { productId: 'p_orange', _sum: { quantity: 30 } },  // between safetyStock and reorderPoint
        { productId: 'p_red', _sum: { quantity: 4 } },      // <= safetyStock, > 0
        { productId: 'p_black', _sum: { quantity: 100 } },  // plenty on hand, but fully reserved below
      ]);
      prisma.stockReservation.groupBy.mockResolvedValue([
        { productId: 'p_black', _sum: { quantity: 100 } }, // fully reserved -> available = 0 -> BLACK despite on-hand=100
      ]);

      const summary = await service.getStockSummary('company_A');
      const byRef = Object.fromEntries(summary.map((s: any) => [s.internalRef, s]));

      expect(byRef.A.health).toBe('GREEN');
      expect(byRef.B.health).toBe('ORANGE');
      expect(byRef.C.health).toBe('RED');
      expect(byRef.D.onHand).toBe(100);
      expect(byRef.D.reserved).toBe(100);
      expect(byRef.D.available).toBe(0);
      expect(byRef.D.health).toBe('BLACK'); // reservations correctly make it look out-of-stock for NEW sales
    });

    it('treats a product with zero movements as BLACK (out of stock), not an error', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p_new', internalRef: 'NEW-1', name: 'منتج جديد', reorderPoint: 10, safetyStock: 2 },
      ]);
      prisma.stockMovement.groupBy.mockResolvedValue([]); // never moved
      prisma.stockReservation.groupBy.mockResolvedValue([]);
      const summary = await service.getStockSummary('company_A');
      expect(summary[0].onHand).toBe(0);
      expect(summary[0].available).toBe(0);
      expect(summary[0].health).toBe('BLACK');
    });
  });

  describe('Product Variants — independent stock pools (PHASE 9)', () => {
    it('getOnHand() scoped to a variantId only counts that SKU\'s own movements', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 25 } });
      await service.getOnHand('company_A', 'prod_1', undefined, 'variant_25mm');
      expect(prisma.stockMovement.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ productId: 'prod_1', variantId: 'variant_25mm' }) }),
      );
    });

    it('getOnHand() without a variantId aggregates across the whole product family (base + all variants)', async () => {
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 100 } });
      await service.getOnHand('company_A', 'prod_1');
      const call = prisma.stockMovement.aggregate.mock.calls[0][0];
      expect(call.where.variantId).toBeUndefined();
    });

    it('reserving one variant does not consume the availability of a sibling variant of the same product', async () => {
      // variant A (25mm) has 50 on hand, nothing reserved yet
      prisma.stockMovement.aggregate.mockResolvedValueOnce({ _sum: { quantity: 50 } }); // getOnHand for variant A
      prisma.stockReservation.aggregate.mockResolvedValueOnce({ _sum: { quantity: 0 } }); // getReserved for variant A
      prisma.stockReservation.create.mockResolvedValue({ id: 'res_a' });

      await service.reserve('company_A', 'so_1', 'prod_1', 40, 'variant_25mm');
      expect(prisma.stockReservation.create).toHaveBeenCalledWith({
        data: { companyId: 'company_A', salesOrderId: 'so_1', productId: 'prod_1', quantity: 40, variantId: 'variant_25mm' },
      });

      // variant B (30mm) of the SAME product has its own separate pool — a
      // fresh call must check variant B's own on-hand/reserved, not be
      // blocked by variant A's reservation.
      prisma.stockMovement.aggregate.mockResolvedValueOnce({ _sum: { quantity: 20 } }); // getOnHand for variant B
      prisma.stockReservation.aggregate.mockResolvedValueOnce({ _sum: { quantity: 0 } }); // getReserved for variant B
      await service.reserve('company_A', 'so_2', 'prod_1', 15, 'variant_30mm');
      expect(prisma.stockReservation.create).toHaveBeenLastCalledWith({
        data: { companyId: 'company_A', salesOrderId: 'so_2', productId: 'prod_1', quantity: 15, variantId: 'variant_30mm' },
      });
    });

    it('rejects reserving more than a specific variant has available, even if the parent product has plenty combined', async () => {
      // variant only has 5 available, even though product-wide stock (across all variants) might be much higher
      prisma.stockMovement.aggregate.mockResolvedValue({ _sum: { quantity: 5 } });
      prisma.stockReservation.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      await expect(
        service.reserve('company_A', 'so_1', 'prod_1', 10, 'variant_25mm'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getVariantStockSummary() — per-SKU breakdown (PHASE 9)', () => {
    it('rejects for a product belonging to a different company', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(service.getVariantStockSummary('company_A', 'prod_from_company_B')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns on-hand/reserved/available computed independently for each variant', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1', companyId: 'company_A' });
      prisma.productVariant.findMany.mockResolvedValue([
        { id: 'variant_25mm', sku: 'RLM-6205-25' },
        { id: 'variant_30mm', sku: 'RLM-6205-30' },
      ]);
      prisma.stockMovement.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: 50 } }) // variant_25mm onHand
        .mockResolvedValueOnce({ _sum: { quantity: 20 } }); // variant_30mm onHand
      prisma.stockReservation.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: 10 } }) // variant_25mm reserved
        .mockResolvedValueOnce({ _sum: { quantity: 0 } }); // variant_30mm reserved

      const summary = await service.getVariantStockSummary('company_A', 'prod_1');
      expect(summary).toEqual([
        { variantId: 'variant_25mm', sku: 'RLM-6205-25', onHand: 50, reserved: 10, available: 40 },
        { variantId: 'variant_30mm', sku: 'RLM-6205-30', onHand: 20, reserved: 0, available: 20 },
      ]);
    });
  });
});
