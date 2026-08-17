import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ImportsService } from '../src/imports/imports.service';
import { StockService } from '../src/stock/stock.service';
import { PrismaService } from '../src/prisma.service';

describe('ImportsService', () => {
  let service: ImportsService;
  let prisma: any;
  let stock: any;

  beforeEach(async () => {
    prisma = {
      purchaseOrder: { findFirst: jest.fn() },
      import: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      importExpense: { create: jest.fn() },
      product: { findUnique: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    stock = { getOnHand: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: stock },
      ],
    }).compile();

    service = moduleRef.get(ImportsService);
  });

  describe('create() — traceability & validation', () => {
    it('rejects an import linked to a PO that is still DRAFT (not yet confirmed)', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po_1', companyId: 'company_A', status: 'DRAFT' });
      await expect(
        service.create('company_A', 'user_1', { purchaseOrderId: 'po_1' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a PO belonging to a different company', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(null);
      await expect(
        service.create('company_A', 'user_1', { purchaseOrderId: 'po_from_company_B' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects creating a second import for the same purchase order', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po_1', companyId: 'company_A', status: 'ORDERED' });
      prisma.import.findUnique.mockResolvedValue({ id: 'existing_import' });
      await expect(
        service.create('company_A', 'user_1', { purchaseOrderId: 'po_1' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the import with a sequential number and DRAFT status', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po_1', companyId: 'company_A', status: 'ORDERED' });
      prisma.import.findUnique.mockResolvedValue(null);
      prisma.import.count.mockResolvedValue(0);
      prisma.import.create.mockResolvedValue({ id: 'imp_1', importNumber: 'IMP-2026-0001', status: 'DRAFT' });

      const result = await service.create('company_A', 'user_1', { purchaseOrderId: 'po_1' } as any);
      expect(result.importNumber).toBe('IMP-2026-0001');
      expect(result.status).toBe('DRAFT');
    });
  });

  describe('computeLandedCost() — True Landed Cost Engine (PHASE 17)', () => {
    it('matches the exact worked example from the spec: 100 purchase + 27 import costs = 127 true cost', async () => {
      // single line, single unit — the simplest form of the spec's example
      prisma.import.findFirst.mockResolvedValue({
        id: 'imp_1', companyId: 'company_A',
        purchaseOrder: {
          items: [
            { productId: 'prod_1', quantityOrdered: 1, unitCost: 100, product: { internalRef: 'X', sellingPrice: 170 } },
          ],
        },
        expenses: [{ amount: 27 }],
      });

      const result = await service.computeLandedCost('company_A', 'imp_1');
      expect(result[0].trueLandedCost).toBeCloseTo(127, 5);
      // gross profit = 170 - 127 = 43 -> margin = 43/170 = 25.29% (also from the spec's example)
      expect(result[0].marginPercent).toBeCloseTo(25.29, 1);
    });

    it('allocates expenses across multiple lines proportionally "by value"', async () => {
      prisma.import.findFirst.mockResolvedValue({
        id: 'imp_1', companyId: 'company_A',
        purchaseOrder: {
          items: [
            // line A: value = 10*100 = 1000 (80% of total value)
            { productId: 'prod_A', quantityOrdered: 10, unitCost: 100, product: { internalRef: 'A', sellingPrice: null } },
            // line B: value = 5*50 = 250 (20% of total value)
            { productId: 'prod_B', quantityOrdered: 5, unitCost: 50, product: { internalRef: 'B', sellingPrice: null } },
          ],
        },
        expenses: [{ amount: 500 }], // total import costs to allocate
      });

      const result = await service.computeLandedCost('company_A', 'imp_1');
      const byRef = Object.fromEntries(result.map((r: any) => [r.internalRef, r]));

      // total value = 1250; A gets 80% of 500 = 400 -> 40/unit -> landed = 140
      expect(byRef.A.allocatedExpensePerUnit).toBeCloseTo(40, 5);
      expect(byRef.A.trueLandedCost).toBeCloseTo(140, 5);
      // B gets 20% of 500 = 100 -> 20/unit -> landed = 70
      expect(byRef.B.allocatedExpensePerUnit).toBeCloseTo(20, 5);
      expect(byRef.B.trueLandedCost).toBeCloseTo(70, 5);
    });

    it('returns raw purchase cost (no allocation) when there are no import expenses yet', async () => {
      prisma.import.findFirst.mockResolvedValue({
        id: 'imp_1', companyId: 'company_A',
        purchaseOrder: { items: [{ productId: 'prod_1', quantityOrdered: 10, unitCost: 82, product: { internalRef: 'X', sellingPrice: null } }] },
        expenses: [],
      });
      const result = await service.computeLandedCost('company_A', 'imp_1');
      expect(result[0].trueLandedCost).toBe(82);
    });
  });

  describe('close() — pushes true landed cost into Product.averageCost', () => {
    const IMPORT = {
      id: 'imp_1', companyId: 'company_A', status: 'RELEASED',
      purchaseOrder: {
        items: [{ productId: 'prod_1', quantityOrdered: 10, unitCost: 100, product: { internalRef: 'X', sellingPrice: null } }],
      },
      expenses: [{ amount: 270 }], // 27/unit landed cost addition -> true landed cost = 127/unit
    };

    it('rejects closing an already-closed import', async () => {
      prisma.import.findFirst.mockResolvedValue({ ...IMPORT, status: 'CLOSED' });
      await expect(service.close('company_A', 'user_1', 'imp_1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates the product weighted-average cost using the TRUE landed cost, not the raw PO cost', async () => {
      prisma.import.findFirst.mockResolvedValue(IMPORT);
      stock.getOnHand.mockResolvedValue(10); // exactly this shipment, nothing prior
      prisma.product.findUnique.mockResolvedValue({ averageCost: null });
      prisma.import.update.mockResolvedValue({ id: 'imp_1', status: 'CLOSED' });

      await service.close('company_A', 'user_1', 'imp_1');

      const updateCall = prisma.product.update.mock.calls[0][0];
      expect(updateCall.data.averageCost).toBeCloseTo(127, 5); // NOT 100 (raw PO cost)
      expect(updateCall.data.lastCost).toBeCloseTo(127, 5);
    });

    it('weight-averages the landed cost against prior stock, same formula as PurchasesService', async () => {
      prisma.import.findFirst.mockResolvedValue(IMPORT);
      stock.getOnHand.mockResolvedValue(20); // 10 prior + 10 from this shipment
      prisma.product.findUnique.mockResolvedValue({ averageCost: 90 }); // prior average was 90/unit
      prisma.import.update.mockResolvedValue({ id: 'imp_1', status: 'CLOSED' });

      await service.close('company_A', 'user_1', 'imp_1');

      // expected: (90*10 + 127*10) / 20 = 108.5
      const updateCall = prisma.product.update.mock.calls[0][0];
      expect(updateCall.data.averageCost).toBeCloseTo(108.5, 5);
    });
  });

  describe('tenant isolation', () => {
    it('cannot read an import belonging to a different company', async () => {
      prisma.import.findFirst.mockResolvedValue(null);
      await expect(service.findOne('company_A', 'imp_from_company_B')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cannot add an expense to an import belonging to a different company', async () => {
      prisma.import.findFirst.mockResolvedValue(null);
      await expect(
        service.addExpense('company_A', 'imp_from_company_B', { type: 'FREIGHT', amount: 100 } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.importExpense.create).not.toHaveBeenCalled();
    });
  });
});
