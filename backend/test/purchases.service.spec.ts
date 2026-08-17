import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PurchasesService } from '../src/purchases/purchases.service';
import { StockService } from '../src/stock/stock.service';
import { FinanceService } from '../src/finance/finance.service';
import { PrismaService } from '../src/prisma.service';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let prisma: any;
  let stock: any;
  let finance: any;

  const SUPPLIER = { id: 'sup_1', companyId: 'company_A', currency: 'MAD' };
  const PRODUCT = { id: 'prod_1', companyId: 'company_A' };

  beforeEach(async () => {
    prisma = {
      supplier: { findFirst: jest.fn() },
      product: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      productVariant: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
      purchaseOrder: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      purchaseOrderItem: { update: jest.fn(), findMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    stock = { recordMovement: jest.fn().mockResolvedValue({ id: 'mv_1' }), getOnHand: jest.fn() };
    finance = { createBillFromPurchaseOrder: jest.fn().mockResolvedValue({ id: 'bill_1', billNumber: 'BILL-2026-0001' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: stock },
        { provide: FinanceService, useValue: finance },
      ],
    }).compile();

    service = moduleRef.get(PurchasesService);
  });

  describe('create() — validation & tenant isolation', () => {
    it('rejects a PO with no items', async () => {
      prisma.supplier.findFirst.mockResolvedValue(SUPPLIER);
      await expect(
        service.create('company_A', 'user_1', { supplierId: 'sup_1', items: [] } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a supplier belonging to a different company', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);
      await expect(
        service.create('company_A', 'user_1', {
          supplierId: 'sup_from_company_B',
          items: [{ productId: 'prod_1', quantityOrdered: 10, unitCost: 50 }],
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a product belonging to a different company', async () => {
      prisma.supplier.findFirst.mockResolvedValue(SUPPLIER);
      prisma.product.findMany.mockResolvedValue([]);
      await expect(
        service.create('company_A', 'user_1', {
          supplierId: 'sup_1',
          items: [{ productId: 'prod_from_company_B', quantityOrdered: 10, unitCost: 50 }],
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a DRAFT purchase order and writes an audit log', async () => {
      prisma.supplier.findFirst.mockResolvedValue(SUPPLIER);
      prisma.product.findMany.mockResolvedValue([PRODUCT]);
      prisma.purchaseOrder.create.mockResolvedValue({ id: 'po_1', status: 'DRAFT' });

      const result = await service.create('company_A', 'user_1', {
        supplierId: 'sup_1',
        items: [{ productId: 'prod_1', quantityOrdered: 100, unitCost: 82 }],
      } as any);

      expect(result.status).toBe('DRAFT');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('order() / cancel() — status transitions', () => {
    it('confirms a DRAFT order to ORDERED', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po_1', companyId: 'company_A', status: 'DRAFT', items: [] });
      prisma.purchaseOrder.update.mockResolvedValue({ id: 'po_1', status: 'ORDERED' });
      const result = await service.order('company_A', 'user_1', 'po_1');
      expect(result.status).toBe('ORDERED');
    });

    it('rejects confirming a PO that is not DRAFT', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po_1', companyId: 'company_A', status: 'ORDERED', items: [] });
      await expect(service.order('company_A', 'user_1', 'po_1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects cancelling a PO that has already started receiving', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po_1', companyId: 'company_A', status: 'RECEIVING', items: [] });
      await expect(service.cancel('company_A', 'user_1', 'po_1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('receive() — permission enforcement', () => {
    it('rejects receiving without the stock.receive permission', async () => {
      await expect(
        service.receive('company_A', 'user_1', ['purchases.view'], false, 'po_1', {
          warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 10 }],
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.purchaseOrder.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('receive() — partial receipts (PHASE 14)', () => {
    const po = {
      id: 'po_1', companyId: 'company_A', status: 'ORDERED',
      items: [{ id: 'item_1', productId: 'prod_1', quantityOrdered: 100, quantityReceived: 0, unitCost: 82, product: { internalRef: 'RLM-6205' } }],
    };

    it('rejects receiving more than the remaining quantity on a line', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(po);
      await expect(
        service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
          warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 150 }],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stock.recordMovement).not.toHaveBeenCalled();
    });

    it('records a real PURCHASE_RECEIPT stock movement and leaves status RECEIVING for a partial receipt', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(po);
      stock.getOnHand.mockResolvedValue(40); // 40 on-hand after a 40-unit partial receipt
      prisma.product.findUnique.mockResolvedValue({ averageCost: null });
      prisma.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: 100, quantityReceived: 40 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: 'po_1', status: 'RECEIVING' });

      const result = await service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
        warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 40 }],
      } as any);

      expect(stock.recordMovement).toHaveBeenCalledWith(
        'company_A', 'user_1', ['stock.receive'], false,
        expect.objectContaining({ productId: 'prod_1', quantity: 40, type: 'PURCHASE_RECEIPT', warehouseId: 'wh_1' }),
      );
      expect(prisma.purchaseOrderItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'item_1' }, data: { quantityReceived: { increment: 40 } } }),
      );
      expect(result.status).toBe('RECEIVING');
    });

    it('marks the order RECEIVED once every line is fully received', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(po);
      stock.getOnHand.mockResolvedValue(100);
      prisma.product.findUnique.mockResolvedValue({ averageCost: 82 });
      prisma.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: 100, quantityReceived: 100 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: 'po_1', status: 'RECEIVED' });

      const result = await service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
        warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 100 }],
      } as any);

      expect(result.status).toBe('RECEIVED');
    });

    it('generates a real supplier bill via FinanceService once the order is fully received', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(po);
      stock.getOnHand.mockResolvedValue(100);
      prisma.product.findUnique.mockResolvedValue({ averageCost: 82 });
      prisma.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: 100, quantityReceived: 100 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: 'po_1', status: 'RECEIVED', supplierId: 'sup_1', items: [] });

      await service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
        warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 100 }],
      } as any);

      expect(finance.createBillFromPurchaseOrder).toHaveBeenCalledWith(
        'company_A',
        expect.objectContaining({ id: 'po_1', status: 'RECEIVED' }),
      );
    });

    it('does NOT generate a bill for a partial receipt (order still RECEIVING)', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(po);
      stock.getOnHand.mockResolvedValue(40);
      prisma.product.findUnique.mockResolvedValue({ averageCost: null });
      prisma.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: 100, quantityReceived: 40 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: 'po_1', status: 'RECEIVING' });

      await service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
        warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 40 }],
      } as any);

      expect(finance.createBillFromPurchaseOrder).not.toHaveBeenCalled();
    });

    it('computes the weighted-average cost across the prior stock and the newly received batch', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(po);
      // prior on-hand was 60 units @ average cost 70; receiving 40 units @ unitCost 82
      // onHandBefore (after movement) = 100 -> priorOnHand = 100 - 40 = 60
      stock.getOnHand.mockResolvedValue(100);
      prisma.product.findUnique.mockResolvedValue({ averageCost: 70 });
      prisma.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: 100, quantityReceived: 40 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: 'po_1', status: 'RECEIVING' });

      await service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
        warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 40 }],
      } as any);

      // expected weighted average: (70*60 + 82*40) / 100 = 74.8
      const updateCall = prisma.product.update.mock.calls[0][0];
      expect(updateCall.data.averageCost).toBeCloseTo(74.8, 1);
      expect(updateCall.data.lastCost).toBe(82);
    });

    it('rejects receiving against a PO that is still DRAFT (not yet ORDERED)', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ ...po, status: 'DRAFT' });
      await expect(
        service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
          warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 10 }],
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propagates a StockService rejection (e.g. tenant mismatch on warehouse) without partially updating quantities', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(po);
      stock.recordMovement.mockRejectedValue(new NotFoundException('المستودع غير موجود'));

      await expect(
        service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
          warehouseId: 'wh_from_company_B', lines: [{ itemId: 'item_1', quantity: 40 }],
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.purchaseOrderItem.update).not.toHaveBeenCalled();
    });
  });

  describe('receive() — Product Variants integration (PHASE 9)', () => {
    const poWithVariant = {
      id: 'po_1', companyId: 'company_A', status: 'ORDERED',
      items: [{
        id: 'item_1', productId: 'prod_1', variantId: 'variant_25mm',
        quantityOrdered: 50, quantityReceived: 0, unitCost: 90,
        product: { internalRef: 'RLM-6205' },
      }],
    };

    it('passes the line\'s variantId through to StockService.recordMovement()', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(poWithVariant);
      stock.getOnHand.mockResolvedValue(50);
      prisma.productVariant.findUnique.mockResolvedValue({ purchaseCost: null });
      prisma.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: 50, quantityReceived: 50 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: 'po_1', status: 'RECEIVED', items: [] });

      await service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
        warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 50 }],
      } as any);

      expect(stock.recordMovement).toHaveBeenCalledWith(
        'company_A', 'user_1', ['stock.receive'], false,
        expect.objectContaining({ productId: 'prod_1', variantId: 'variant_25mm', quantity: 50 }),
      );
    });

    it('updates the VARIANT\'s own purchaseCost (weighted average), leaving the parent product cost untouched', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(poWithVariant);
      stock.getOnHand.mockResolvedValue(50); // all-new variant stock, no prior on-hand
      prisma.productVariant.findUnique.mockResolvedValue({ purchaseCost: null });
      prisma.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: 50, quantityReceived: 50 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: 'po_1', status: 'RECEIVED', items: [] });

      await service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
        warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 50 }],
      } as any);

      expect(prisma.productVariant.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'variant_25mm' }, data: { purchaseCost: 90 } }),
      );
      // the parent Product.averageCost update path must NOT run for a variant-specific line
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('weight-averages the variant cost against its own prior stock, not the product\'s combined stock', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(poWithVariant);
      stock.getOnHand.mockResolvedValue(100); // 50 prior + 50 from this receipt, scoped to this variant only
      prisma.productVariant.findUnique.mockResolvedValue({ purchaseCost: 70 }); // prior variant average
      prisma.purchaseOrderItem.findMany.mockResolvedValue([{ quantityOrdered: 50, quantityReceived: 50 }]);
      prisma.purchaseOrder.update.mockResolvedValue({ id: 'po_1', status: 'RECEIVED', items: [] });

      await service.receive('company_A', 'user_1', ['stock.receive'], false, 'po_1', {
        warehouseId: 'wh_1', lines: [{ itemId: 'item_1', quantity: 50 }],
      } as any);

      // expected: (70*50 + 90*50) / 100 = 80
      const updateCall = prisma.productVariant.update.mock.calls[0][0];
      expect(updateCall.data.purchaseCost).toBeCloseTo(80, 5);
    });
  });
});
