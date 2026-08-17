import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FinanceService } from '../src/finance/finance.service';
import { PrismaService } from '../src/prisma.service';

describe('FinanceService', () => {
  let service: FinanceService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      invoice: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      payment: { create: jest.fn() },
      bill: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      supplierPayment: { create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [FinanceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(FinanceService);
  });

  describe('createInvoiceFromOrder() — traceability (PHASE 34)', () => {
    it('rejects generating a second invoice for the same order', async () => {
      prisma.invoice.findUnique.mockResolvedValue({ id: 'existing_invoice' });
      await expect(
        service.createInvoiceFromOrder('company_A', { id: 'so_1', customerId: 'cust_1', items: [] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('computes totalAmount and costAmount from order line items, and assigns a sequential invoice number', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      prisma.invoice.count.mockResolvedValue(2); // 2 invoices already issued this year
      prisma.invoice.create.mockResolvedValue({ id: 'inv_1' });

      await service.createInvoiceFromOrder('company_A', {
        id: 'so_1',
        customerId: 'cust_1',
        items: [
          { quantity: 2, unitPrice: 170, unitCost: 127 },
          { quantity: 1, unitPrice: 50, unitCost: 30 },
        ],
      });

      const createCall = prisma.invoice.create.mock.calls[0][0];
      expect(createCall.data.totalAmount).toBe(390); // 2*170 + 1*50
      expect(createCall.data.costAmount).toBe(284); // 2*127 + 1*30
      expect(createCall.data.status).toBe('UNPAID');
      expect(createCall.data.invoiceNumber).toMatch(/^INV-\d{4}-0003$/); // 3rd invoice this year
    });
  });

  describe('recordPayment() — no overpayment allowed (PHASE 34)', () => {
    const INVOICE = { id: 'inv_1', companyId: 'company_A', totalAmount: 1000, status: 'UNPAID', payments: [] };

    it('rejects a payment exceeding the remaining balance', async () => {
      prisma.invoice.findFirst.mockResolvedValue(INVOICE);
      await expect(
        service.recordPayment('company_A', 'user_1', 'inv_1', 1500),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('marks the invoice PARTIALLY_PAID after a partial payment', async () => {
      prisma.invoice.findFirst.mockResolvedValue(INVOICE);
      prisma.invoice.update.mockResolvedValue({ id: 'inv_1', status: 'PARTIALLY_PAID' });

      const result = await service.recordPayment('company_A', 'user_1', 'inv_1', 400);
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: 400, invoiceId: 'inv_1' }) }),
      );
      const updateCall = prisma.invoice.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('PARTIALLY_PAID');
    });

    it('marks the invoice PAID once cumulative payments reach the total', async () => {
      const partiallyPaid = { ...INVOICE, status: 'PARTIALLY_PAID', payments: [{ amount: 400 }] };
      prisma.invoice.findFirst.mockResolvedValue(partiallyPaid);
      prisma.invoice.update.mockResolvedValue({ id: 'inv_1', status: 'PAID' });

      await service.recordPayment('company_A', 'user_1', 'inv_1', 600);
      const updateCall = prisma.invoice.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('PAID');
    });

    it('accounts for prior payments when checking the remaining balance', async () => {
      const partiallyPaid = { ...INVOICE, status: 'PARTIALLY_PAID', payments: [{ amount: 700 }] };
      prisma.invoice.findFirst.mockResolvedValue(partiallyPaid);
      // only 300 remains — attempting 350 should fail
      await expect(
        service.recordPayment('company_A', 'user_1', 'inv_1', 350),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects recording a payment on a cancelled invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...INVOICE, status: 'CANCELLED' });
      await expect(service.recordPayment('company_A', 'user_1', 'inv_1', 100)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a payment for an invoice belonging to a different company (tenant isolation)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null); // tenant-scoped lookup found nothing
      await expect(
        service.recordPayment('company_A', 'user_1', 'invoice_from_company_B', 100),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createBillFromPurchaseOrder() — Payables traceability', () => {
    it('rejects generating a second bill for the same purchase order', async () => {
      prisma.bill.findUnique.mockResolvedValue({ id: 'existing_bill' });
      await expect(
        service.createBillFromPurchaseOrder('company_A', { id: 'po_1', supplierId: 'sup_1', items: [] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.bill.create).not.toHaveBeenCalled();
    });

    it('computes totalAmount from received quantities × unit cost, with sequential numbering', async () => {
      prisma.bill.findUnique.mockResolvedValue(null);
      prisma.bill.count.mockResolvedValue(0);
      prisma.bill.create.mockResolvedValue({ id: 'bill_1' });

      await service.createBillFromPurchaseOrder('company_A', {
        id: 'po_1',
        supplierId: 'sup_1',
        items: [
          { quantityOrdered: 100, unitCost: 82 },
          { quantityOrdered: 50, unitCost: 30 },
        ],
      });

      const createCall = prisma.bill.create.mock.calls[0][0];
      expect(createCall.data.totalAmount).toBe(9700); // 100*82 + 50*30
      expect(createCall.data.status).toBe('UNPAID');
      expect(createCall.data.billNumber).toMatch(/^BILL-\d{4}-0001$/);
    });
  });

  describe('recordSupplierPayment() — no overpayment on Payables either', () => {
    const BILL = { id: 'bill_1', companyId: 'company_A', totalAmount: 5000, status: 'UNPAID', supplierPayments: [] };

    it('rejects a payment exceeding the remaining balance', async () => {
      prisma.bill.findFirst.mockResolvedValue(BILL);
      await expect(
        service.recordSupplierPayment('company_A', 'user_1', 'bill_1', 6000),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.supplierPayment.create).not.toHaveBeenCalled();
    });

    it('marks the bill PAID once cumulative payments reach the total', async () => {
      prisma.bill.findFirst.mockResolvedValue(BILL);
      prisma.bill.update.mockResolvedValue({ id: 'bill_1', status: 'PAID' });

      await service.recordSupplierPayment('company_A', 'user_1', 'bill_1', 5000);
      const updateCall = prisma.bill.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('PAID');
    });

    it('rejects a payment on a bill from a different company (tenant isolation)', async () => {
      prisma.bill.findFirst.mockResolvedValue(null);
      await expect(
        service.recordSupplierPayment('company_A', 'user_1', 'bill_from_company_B', 100),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getFinancialSummary() — real dashboard aggregates (PHASE 37)', () => {
    it('computes revenue, cost, margin, and receivables from actual invoices', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        { totalAmount: 1000, costAmount: 700, status: 'PAID', dueDate: null, payments: [{ amount: 1000 }] },
        { totalAmount: 500, costAmount: 380, status: 'UNPAID', dueDate: null, payments: [] },
      ]);
      prisma.bill.findMany.mockResolvedValue([]);

      const summary = await service.getFinancialSummary('company_A');
      expect(summary.revenue).toBe(1500);
      expect(summary.cost).toBe(1080);
      expect(summary.grossProfit).toBe(420);
      expect(summary.marginPercent).toBeCloseTo(28, 0);
      expect(summary.receivables).toBe(500); // only the unpaid one
    });

    it('flags only genuinely overdue unpaid invoices', async () => {
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      const nextMonth = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      prisma.invoice.findMany.mockResolvedValue([
        { totalAmount: 300, costAmount: 200, status: 'UNPAID', dueDate: yesterday, payments: [] },
        { totalAmount: 400, costAmount: 250, status: 'UNPAID', dueDate: nextMonth, payments: [] },
      ]);
      prisma.bill.findMany.mockResolvedValue([]);

      const summary = await service.getFinancialSummary('company_A');
      expect(summary.overdueReceivables).toBe(300);
    });

    it('computes payables from unpaid/partially-paid supplier bills, separately from receivables', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.bill.findMany.mockResolvedValue([
        { totalAmount: 9700, status: 'UNPAID', supplierPayments: [] },
        { totalAmount: 2000, status: 'PARTIALLY_PAID', supplierPayments: [{ amount: 800 }] },
      ]);

      const summary = await service.getFinancialSummary('company_A');
      expect(summary.payables).toBe(9700 + 1200); // 9700 unpaid + (2000-800) remaining
    });
  });
});
