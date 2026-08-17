import { NotFoundException } from '@nestjs/common';
import { SuppliersService } from '../src/suppliers/suppliers.service';
import { PrismaService } from '../src/prisma.service';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      supplier: { findFirst: jest.fn(), create: jest.fn() },
      product: { findFirst: jest.fn() },
      purchaseOrder: { findMany: jest.fn() },
      supplierProductOffer: { upsert: jest.fn(), findMany: jest.fn() },
    };
    service = new SuppliersService(prisma as unknown as PrismaService);
  });

  describe('computeReliability() — Supplier Performance Score (PHASE 12)', () => {
    it('gives a new supplier with no completed history the benefit of the doubt (100, sample size 0)', async () => {
      prisma.purchaseOrder.findMany.mockResolvedValue([]);
      const result = await service.computeReliability('company_A', 'sup_1');
      expect(result).toEqual({ score: 100, sampleSize: 0 });
    });

    it('computes the on-time percentage from real completed orders', async () => {
      prisma.purchaseOrder.findMany.mockResolvedValue([
        { updatedAt: new Date('2026-01-10'), expectedDate: new Date('2026-01-15') }, // on time
        { updatedAt: new Date('2026-02-20'), expectedDate: new Date('2026-02-15') }, // late
        { updatedAt: new Date('2026-03-01'), expectedDate: new Date('2026-03-01') }, // exactly on time
        { updatedAt: new Date('2026-04-05'), expectedDate: new Date('2026-04-10') }, // on time
      ]);
      const result = await service.computeReliability('company_A', 'sup_1');
      expect(result.sampleSize).toBe(4);
      expect(result.score).toBe(75); // 3 of 4 on time
    });

    it('only counts fully RECEIVED orders with a known expected date', async () => {
      prisma.purchaseOrder.findMany.mockResolvedValue([]);
      await service.computeReliability('company_A', 'sup_1');
      const call = prisma.purchaseOrder.findMany.mock.calls[0][0];
      expect(call.where).toEqual(
        expect.objectContaining({ companyId: 'company_A', supplierId: 'sup_1', status: 'RECEIVED' }),
      );
    });
  });

  describe('addOffer() — RFQ / price catalogue', () => {
    it('rejects an offer for a supplier belonging to a different company', async () => {
      prisma.supplier.findFirst.mockResolvedValue(null);
      await expect(
        service.addOffer('company_A', 'sup_from_company_B', { productId: 'prod_1', unitCost: 100 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an offer for a product belonging to a different company', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 'sup_1', companyId: 'company_A' });
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(
        service.addOffer('company_A', 'sup_1', { productId: 'prod_from_company_B', unitCost: 100 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('upserts — a second offer for the same supplier+product updates rather than duplicates', async () => {
      prisma.supplier.findFirst.mockResolvedValue({ id: 'sup_1', companyId: 'company_A' });
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1', companyId: 'company_A' });
      prisma.supplierProductOffer.upsert.mockResolvedValue({ id: 'offer_1' });

      await service.addOffer('company_A', 'sup_1', { productId: 'prod_1', unitCost: 88 });
      expect(prisma.supplierProductOffer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { supplierId_productId: { supplierId: 'sup_1', productId: 'prod_1' } } }),
      );
    });
  });

  describe('compareForProduct() — composite ranking ("الأفضل ليس بالضرورة الأرخص")', () => {
    it('returns an empty list when no supplier has quoted the product', async () => {
      prisma.supplierProductOffer.findMany.mockResolvedValue([]);
      const result = await service.compareForProduct('company_A', 'prod_1');
      expect(result).toEqual([]);
    });

    it('recommends a pricier-but-reliable-and-fast supplier over the cheapest one with poor reliability', async () => {
      // Mirrors the worked example from the product spec / demo:
      // SKF: pricier, but reliable and fast -> should win.
      // NSK: cheapest, but unreliable and very slow -> should lose despite lowest cost.
      prisma.supplierProductOffer.findMany.mockResolvedValue([
        { supplierId: 'sup_skf', productId: 'prod_1', unitCost: 82, currency: 'EUR', leadTimeDays: 21, supplier: { name: 'SKF Distribution EU', leadTimeDays: 21 } },
        { supplierId: 'sup_fag', productId: 'prod_1', unitCost: 88, currency: 'MAD', leadTimeDays: 5, supplier: { name: 'FAG Maroc', leadTimeDays: 5 } },
        { supplierId: 'sup_nsk', productId: 'prod_1', unitCost: 74, currency: 'USD', leadTimeDays: 38, supplier: { name: 'NSK Trading Asia', leadTimeDays: 38 } },
      ]);
      // reliability: SKF excellent, FAG good, NSK poor (based on real history)
      prisma.purchaseOrder.findMany.mockImplementation(({ where }: any) => {
        if (where.supplierId === 'sup_skf') return Promise.resolve(Array(10).fill({ updatedAt: new Date('2026-01-01'), expectedDate: new Date('2026-01-05') }));
        if (where.supplierId === 'sup_fag') return Promise.resolve(Array(10).fill(0).map((_, i) => ({ updatedAt: new Date('2026-01-01'), expectedDate: i < 9 ? new Date('2026-01-05') : new Date('2025-12-01') })));
        if (where.supplierId === 'sup_nsk') return Promise.resolve(Array(10).fill(0).map((_, i) => ({ updatedAt: new Date('2026-01-10'), expectedDate: i < 3 ? new Date('2026-01-05') : new Date('2025-12-01') })));
        return Promise.resolve([]);
      });

      const ranked = await service.compareForProduct('company_A', 'prod_1');

      expect(ranked).toHaveLength(3);
      // NSK is the cheapest (74) yet must NOT be ranked best due to poor reliability + slow lead time
      const best = ranked.find((r) => r.best);
      expect(best?.supplierId).not.toBe('sup_nsk');
      // every offer's fields are populated for the comparison table
      for (const r of ranked) {
        expect(typeof r.compositeScore).toBe('number');
        expect(typeof r.reliability).toBe('number');
        expect(typeof r.costScore).toBe('number');
      }
    });

    it('flags exactly one offer as "best"', async () => {
      prisma.supplierProductOffer.findMany.mockResolvedValue([
        { supplierId: 'sup_a', productId: 'prod_1', unitCost: 100, currency: 'MAD', leadTimeDays: 10, supplier: { name: 'A', leadTimeDays: 10 } },
        { supplierId: 'sup_b', productId: 'prod_1', unitCost: 100, currency: 'MAD', leadTimeDays: 10, supplier: { name: 'B', leadTimeDays: 10 } },
      ]);
      prisma.purchaseOrder.findMany.mockResolvedValue([]);

      const ranked = await service.compareForProduct('company_A', 'prod_1');
      expect(ranked.filter((r) => r.best)).toHaveLength(1);
    });

    it('always scopes offers to the caller company', async () => {
      prisma.supplierProductOffer.findMany.mockResolvedValue([]);
      await service.compareForProduct('company_A', 'prod_1');
      expect(prisma.supplierProductOffer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company_A', productId: 'prod_1' } }),
      );
    });
  });
});
