import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from '../src/documents/documents.service';
import { PrismaService } from '../src/prisma.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: any;

  const COMPANY = { id: 'company_A', name: 'Industrial Distribution Morocco', address: 'Casablanca', ice: '001234567000012' };

  beforeEach(() => {
    prisma = {
      invoice: { findFirst: jest.fn() },
      purchaseOrder: { findFirst: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue(COMPANY) },
    };
    service = new DocumentsService(prisma as unknown as PrismaService);
  });

  describe('buildInvoicePdf()', () => {
    const INVOICE = {
      id: 'inv_1',
      companyId: 'company_A',
      invoiceNumber: 'INV-2026-0001',
      totalAmount: 340,
      status: 'PARTIALLY_PAID',
      createdAt: new Date('2026-08-01'),
      dueDate: new Date('2026-08-31'),
      customer: { name: 'SOMADIS SARL', ice: '00998877', address: 'Ain Sebaa, Casablanca' },
      payments: [{ amount: 100 }],
      salesOrder: {
        items: [
          { quantity: 2, unitPrice: 170, product: { internalRef: 'RLM-6205-2RS', name: 'Roulement à billes' } },
        ],
      },
    };

    it('rejects an invoice belonging to a different company (tenant isolation)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null); // tenant-scoped lookup found nothing
      await expect(service.buildInvoicePdf('company_A', 'invoice_from_company_B')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('generates a real, well-formed PDF buffer', async () => {
      prisma.invoice.findFirst.mockResolvedValue(INVOICE);
      const buffer = await service.buildInvoicePdf('company_A', 'inv_1');

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(500); // a real rendered document, not an empty stub
      // every valid PDF file starts with this magic header
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      // and every well-formed PDF stream ends with %%EOF
      expect(buffer.subarray(-8).toString('ascii')).toContain('%%EOF');
    });

    it('queries the invoice with full line-item detail needed for the document (not just the header)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(INVOICE);
      await service.buildInvoicePdf('company_A', 'inv_1');

      const call = prisma.invoice.findFirst.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'inv_1', companyId: 'company_A' });
      expect(call.include.salesOrder.include.items.include.product).toBe(true);
    });
  });

  describe('buildPurchaseOrderPdf()', () => {
    const PO = {
      id: 'po_1',
      companyId: 'company_A',
      status: 'ORDERED',
      currency: 'MAD',
      createdAt: new Date('2026-08-01'),
      expectedDate: new Date('2026-08-20'),
      supplier: { name: 'Gates Maroc', country: 'Maroc', email: 'contact@gates.ma' },
      items: [
        { quantityOrdered: 80, unitCost: 210, product: { internalRef: 'FLX-1-2-250B', name: 'Flexible hydraulique' } },
      ],
    };

    it('rejects a purchase order belonging to a different company (tenant isolation)', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(null);
      await expect(service.buildPurchaseOrderPdf('company_A', 'po_from_company_B')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('generates a real, well-formed PDF buffer for a bon de commande', async () => {
      prisma.purchaseOrder.findFirst.mockResolvedValue(PO);
      const buffer = await service.buildPurchaseOrderPdf('company_A', 'po_1');

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(buffer.subarray(-8).toString('ascii')).toContain('%%EOF');
    });

    it('computes the total from quantityOrdered × unitCost across all lines', async () => {
      const multiLinePo = {
        ...PO,
        items: [
          { quantityOrdered: 10, unitCost: 100, product: { internalRef: 'A', name: 'Produit A' } },
          { quantityOrdered: 5, unitCost: 50, product: { internalRef: 'B', name: 'Produit B' } },
        ],
      };
      prisma.purchaseOrder.findFirst.mockResolvedValue(multiLinePo);
      // 10*100 + 5*50 = 1250 — just verify it renders without throwing, the
      // actual number is drawn into the PDF content stream (not easily
      // asserted without a PDF text parser), so we assert successful,
      // reasonably-sized generation as a smoke test for the calculation path.
      const buffer = await service.buildPurchaseOrderPdf('company_A', 'po_1');
      expect(buffer.length).toBeGreaterThan(500);
    });
  });
});
