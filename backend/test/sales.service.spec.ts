import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SalesService } from '../src/sales/sales.service';
import { StockService } from '../src/stock/stock.service';
import { FinanceService } from '../src/finance/finance.service';
import { PrismaService } from '../src/prisma.service';

describe('SalesService', () => {
  let service: SalesService;
  let prisma: any;
  let stock: any;
  let finance: any;

  const CUSTOMER = { id: 'cust_1', companyId: 'company_A' };
  const PRODUCT_OK = { id: 'prod_1', companyId: 'company_A', averageCost: 60, minMarginPercent: null };
  const PRODUCT_MIN_MARGIN = { id: 'prod_2', companyId: 'company_A', averageCost: 80, minMarginPercent: 20 };

  beforeEach(async () => {
    prisma = {
      customer: { findFirst: jest.fn() },
      product: { findMany: jest.fn() },
      productVariant: { findMany: jest.fn().mockResolvedValue([]) },
      salesOrder: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    stock = {
      recordMovement: jest.fn().mockResolvedValue({ id: 'mv_1' }),
      reserve: jest.fn().mockResolvedValue({ id: 'res_1' }),
      releaseReservationsForOrder: jest.fn().mockResolvedValue({ count: 0 }),
    };
    finance = { createInvoiceFromOrder: jest.fn().mockResolvedValue({ id: 'inv_1', invoiceNumber: 'INV-2026-0001' }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockService, useValue: stock },
        { provide: FinanceService, useValue: finance },
      ],
    }).compile();

    service = moduleRef.get(SalesService);
  });

  describe('create() — Minimum Margin Protection (PHASE 26)', () => {
    it('rejects an order selling below the product minimum margin without an override reason', async () => {
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.product.findMany.mockResolvedValue([PRODUCT_MIN_MARGIN]);

      // sells at 90 with cost 80 -> margin = 11.1%, below the 20% minimum
      await expect(
        service.create('company_A', 'user_1', {
          customerId: 'cust_1',
          items: [{ productId: 'prod_2', quantity: 1, unitPrice: 90 }],
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.salesOrder.create).not.toHaveBeenCalled();
    });

    it('allows the same order once an override reason is supplied, and logs it to the audit trail', async () => {
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.product.findMany.mockResolvedValue([PRODUCT_MIN_MARGIN]);
      prisma.salesOrder.create.mockResolvedValue({ id: 'so_1', items: [] });

      await service.create('company_A', 'user_1', {
        customerId: 'cust_1',
        items: [{ productId: 'prod_2', quantity: 1, unitPrice: 90 }],
        marginOverrideReason: 'عميل استراتيجي - موافقة المدير',
      } as any);

      expect(prisma.salesOrder.create).toHaveBeenCalled();
      const auditCall = prisma.auditLog.create.mock.calls[0][0];
      expect(auditCall.data.newValue.marginOverrideReason).toBe('عميل استراتيجي - موافقة المدير');
      expect(auditCall.data.newValue.belowMinMargin).toHaveLength(1);
    });

    it('allows an order at or above minimum margin without needing an override', async () => {
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.product.findMany.mockResolvedValue([PRODUCT_MIN_MARGIN]);
      prisma.salesOrder.create.mockResolvedValue({ id: 'so_2', items: [] });

      // sells at 100 with cost 80 -> margin = 20%, exactly at minimum
      await service.create('company_A', 'user_1', {
        customerId: 'cust_1',
        items: [{ productId: 'prod_2', quantity: 1, unitPrice: 100 }],
      } as any);

      expect(prisma.salesOrder.create).toHaveBeenCalled();
    });

    it('does not block products without a configured minimum margin', async () => {
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.product.findMany.mockResolvedValue([PRODUCT_OK]);
      prisma.salesOrder.create.mockResolvedValue({ id: 'so_3', items: [] });

      // sells at a loss (50 < cost 60) but no minMarginPercent configured -> allowed
      await service.create('company_A', 'user_1', {
        customerId: 'cust_1',
        items: [{ productId: 'prod_1', quantity: 1, unitPrice: 50 }],
      } as any);

      expect(prisma.salesOrder.create).toHaveBeenCalled();
    });
  });

  describe('create() — validation & tenant isolation', () => {
    it('rejects an order with no items', async () => {
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      await expect(
        service.create('company_A', 'user_1', { customerId: 'cust_1', items: [] } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an order referencing a product from a different company', async () => {
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.product.findMany.mockResolvedValue([]); // tenant-scoped lookup found nothing
      await expect(
        service.create('company_A', 'user_1', {
          customerId: 'cust_1',
          items: [{ productId: 'prod_from_company_B', quantity: 1, unitPrice: 100 }],
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an order for a customer belonging to a different company', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        service.create('company_A', 'user_1', {
          customerId: 'cust_from_company_B',
          items: [{ productId: 'prod_1', quantity: 1, unitPrice: 100 }],
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('status transitions (PHASE 24)', () => {
    it('allows QUOTATION -> READY and reserves stock for every line', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'so_1', status: 'QUOTATION',
        items: [{ productId: 'prod_1', quantity: 5 }, { productId: 'prod_2', quantity: 2 }],
      });
      prisma.salesOrder.update.mockResolvedValue({ id: 'so_1', status: 'READY' });

      const result = await service.confirm('company_A', 'user_1', 'so_1');

      expect(result.status).toBe('READY');
      expect(stock.reserve).toHaveBeenCalledTimes(2);
      expect(stock.reserve).toHaveBeenCalledWith('company_A', 'so_1', 'prod_1', 5, undefined);
      expect(stock.reserve).toHaveBeenCalledWith('company_A', 'so_1', 'prod_2', 2, undefined);
    });

    it('rolls back any partial reservations if one line cannot be reserved', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'so_1', status: 'QUOTATION',
        items: [{ productId: 'prod_1', quantity: 5 }, { productId: 'prod_2', quantity: 999 }],
      });
      stock.reserve
        .mockResolvedValueOnce({ id: 'res_1' }) // prod_1 succeeds
        .mockRejectedValueOnce(new BadRequestException('الكمية تفوق المتوفر')); // prod_2 fails

      await expect(service.confirm('company_A', 'user_1', 'so_1')).rejects.toBeInstanceOf(BadRequestException);
      expect(stock.releaseReservationsForOrder).toHaveBeenCalledWith('company_A', 'so_1');
      expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    });

    it('rejects confirming an order that is not in QUOTATION status', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({ id: 'so_1', status: 'READY', items: [] });
      await expect(service.confirm('company_A', 'user_1', 'so_1')).rejects.toBeInstanceOf(BadRequestException);
      expect(stock.reserve).not.toHaveBeenCalled();
    });

    it('releases reservations when an order is cancelled', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({ id: 'so_1', status: 'QUOTATION' });
      prisma.salesOrder.update.mockResolvedValue({ id: 'so_1', status: 'CANCELLED' });

      await service.cancel('company_A', 'user_1', 'so_1');
      expect(stock.releaseReservationsForOrder).toHaveBeenCalledWith('company_A', 'so_1');
    });

    it('rejects skipping states, e.g. QUOTATION -> DELIVERED directly', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({ id: 'so_1', status: 'QUOTATION' });
      await expect(service.advance('company_A', 'user_1', 'so_1', 'DELIVERED')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects any transition out of a terminal INVOICED state', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({ id: 'so_1', status: 'INVOICED' });
      await expect(service.advance('company_A', 'user_1', 'so_1', 'CANCELLED')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects cancelling an order that is already PACKED (past the cancellable window)', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({ id: 'so_1', status: 'PACKED' });
      await expect(service.cancel('company_A', 'user_1', 'so_1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deliver() — real stock integration', () => {
    it('records one SALE stock movement per order line via StockService, then marks DELIVERED', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'so_1',
        status: 'PACKED',
        items: [
          { productId: 'prod_1', quantity: 3 },
          { productId: 'prod_2', quantity: 2 },
        ],
      });
      prisma.salesOrder.update.mockResolvedValue({ id: 'so_1', status: 'DELIVERED' });

      const result = await service.deliver('company_A', 'user_1', ['stock.adjust'], false, 'so_1', 'wh_1');

      expect(stock.recordMovement).toHaveBeenCalledTimes(2);
      expect(stock.recordMovement).toHaveBeenCalledWith(
        'company_A', 'user_1', ['stock.adjust'], false,
        expect.objectContaining({ productId: 'prod_1', quantity: -3, type: 'SALE' }),
      );
      expect(result.status).toBe('DELIVERED');
    });

    it('refuses to deliver an order still in QUOTATION status', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({ id: 'so_1', status: 'QUOTATION', items: [] });
      await expect(
        service.deliver('company_A', 'user_1', ['stock.adjust'], false, 'so_1', 'wh_1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stock.recordMovement).not.toHaveBeenCalled();
    });

    it('propagates a StockService rejection (e.g. insufficient stock) instead of marking the order delivered', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'so_1', status: 'PACKED', items: [{ productId: 'prod_1', quantity: 999 }],
      });
      stock.recordMovement.mockRejectedValue(new BadRequestException('الكمية المطلوبة تفوق المتوفر'));

      await expect(
        service.deliver('company_A', 'user_1', ['stock.adjust'], false, 'so_1', 'wh_1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.salesOrder.update).not.toHaveBeenCalled();
    });
  });

  describe('invoice() — real invoice generation (PHASE 34)', () => {
    it('transitions to INVOICED and generates a real invoice via FinanceService, traceable to the order', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({ id: 'so_1', status: 'DELIVERED', customerId: 'cust_1', items: [] });
      prisma.salesOrder.update.mockResolvedValue({ id: 'so_1', status: 'INVOICED', customerId: 'cust_1', items: [] });

      const result = await service.invoice('company_A', 'user_1', 'so_1');

      expect(finance.createInvoiceFromOrder).toHaveBeenCalledWith(
        'company_A',
        expect.objectContaining({ id: 'so_1' }),
      );
      expect(result.invoice.invoiceNumber).toBe('INV-2026-0001');
      expect(result.order.status).toBe('INVOICED');
    });

    it('rejects invoicing an order that is not yet DELIVERED', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({ id: 'so_1', status: 'QUOTATION' });
      await expect(service.invoice('company_A', 'user_1', 'so_1')).rejects.toBeInstanceOf(BadRequestException);
      expect(finance.createInvoiceFromOrder).not.toHaveBeenCalled();
    });
  });

  describe('computeOrderMargin() — true margin (PHASE 17)', () => {
    it('computes revenue, cost, gross profit and margin percent from cost snapshots', () => {
      const result = service.computeOrderMargin({
        items: [
          { quantity: 2, unitPrice: 170, unitCost: 127 }, // matches the PHASE 17 worked example
        ],
      });
      expect(result.revenue).toBe(340);
      expect(result.cost).toBe(254);
      expect(result.grossProfit).toBe(86);
      expect(result.marginPercent).toBeCloseTo(25.29, 1);
    });
  });

  describe('create() — Product Variants integration (PHASE 9)', () => {
    it('rejects a variantId that does not belong to the declared product', async () => {
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.product.findMany.mockResolvedValue([PRODUCT_OK]);
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'variant_1', productId: 'prod_OTHER', purchaseCost: 60 }]);

      await expect(
        service.create('company_A', 'user_1', {
          customerId: 'cust_1',
          items: [{ productId: 'prod_1', variantId: 'variant_1', quantity: 1, unitPrice: 100 }],
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('uses the variant\'s own purchaseCost (not the parent product\'s) for margin & cost snapshot when a variant is sold', async () => {
      prisma.customer.findFirst.mockResolvedValue(CUSTOMER);
      prisma.product.findMany.mockResolvedValue([PRODUCT_OK]); // product-level averageCost: 60
      prisma.productVariant.findMany.mockResolvedValue([{ id: 'variant_1', productId: 'prod_1', purchaseCost: 90 }]);
      prisma.salesOrder.create.mockResolvedValue({ id: 'so_1', items: [] });

      await service.create('company_A', 'user_1', {
        customerId: 'cust_1',
        items: [{ productId: 'prod_1', variantId: 'variant_1', quantity: 1, unitPrice: 100 }],
      } as any);

      const createCall = prisma.salesOrder.create.mock.calls[0][0];
      const line = createCall.data.items.create[0];
      expect(line.variantId).toBe('variant_1');
      expect(line.unitCost).toBe(90); // the variant's cost, not the product's averageCost of 60
    });
  });

  describe('confirm() / deliver() — variantId threaded through to stock operations', () => {
    it('passes the line\'s variantId to StockService.reserve()', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'so_1', status: 'QUOTATION',
        items: [{ productId: 'prod_1', variantId: 'variant_1', quantity: 3 }],
      });
      prisma.salesOrder.update.mockResolvedValue({ id: 'so_1', status: 'READY' });

      await service.confirm('company_A', 'user_1', 'so_1');
      expect(stock.reserve).toHaveBeenCalledWith('company_A', 'so_1', 'prod_1', 3, 'variant_1');
    });

    it('passes the line\'s variantId to StockService.recordMovement() on delivery', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'so_1', status: 'PACKED',
        items: [{ productId: 'prod_1', variantId: 'variant_1', quantity: 3 }],
      });
      prisma.salesOrder.update.mockResolvedValue({ id: 'so_1', status: 'DELIVERED' });

      await service.deliver('company_A', 'user_1', ['stock.adjust'], false, 'so_1', 'wh_1');
      expect(stock.recordMovement).toHaveBeenCalledWith(
        'company_A', 'user_1', ['stock.adjust'], false,
        expect.objectContaining({ variantId: 'variant_1' }),
      );
    });
  });
});
