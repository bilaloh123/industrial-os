import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const INVOICE_INCLUDE = { customer: true, payments: true, salesOrder: true } as const;

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // Auto-generates a customer invoice from a delivered sales order.
  // Called by SalesService.invoice() — never exposed as a standalone
  // "create invoice from nothing" endpoint, since every invoice must
  // trace back to a real sales order (PHASE 34).
  // ---------------------------------------------------------------
  async createInvoiceFromOrder(companyId: string, order: {
    id: string; customerId: string;
    items: { quantity: number; unitPrice: number; unitCost: number }[];
  }) {
    const existing = await this.prisma.invoice.findUnique({ where: { salesOrderId: order.id } });
    if (existing) throw new ConflictException('تم إصدار فاتورة لهذا الطلب من قبل');

    const totalAmount = order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const costAmount = order.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

    const invoiceNumber = await this.nextInvoiceNumber(companyId);

    return this.prisma.invoice.create({
      data: {
        companyId,
        salesOrderId: order.id,
        customerId: order.customerId,
        invoiceNumber,
        totalAmount,
        costAmount,
        status: 'UNPAID',
        dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000), // default 30-day terms
      },
      include: INVOICE_INCLUDE,
    });
  }

  private async nextInvoiceNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.invoice.count({
      where: { companyId, invoiceNumber: { startsWith: `INV-${year}-` } },
    });
    return `INV-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async list(companyId: string) {
    return this.prisma.invoice.findMany({
      where: { companyId },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, companyId }, include: INVOICE_INCLUDE });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    return invoice;
  }

  // ---------------------------------------------------------------
  // RECORD PAYMENT — supports partial payments, never allows the sum of
  // payments to exceed the invoice total (PHASE 34).
  // ---------------------------------------------------------------
  async recordPayment(companyId: string, actorId: string, invoiceId: string, amount: number, method?: string) {
    const invoice = await this.findOne(companyId, invoiceId);
    if (invoice.status === 'CANCELLED') throw new BadRequestException('لا يمكن تسجيل دفعة على فاتورة ملغاة');

    const alreadyPaid = invoice.payments.reduce((sum: number, p: any) => sum + p.amount, 0);
    const remaining = invoice.totalAmount - alreadyPaid;
    if (amount > remaining + 0.001) {
      throw new BadRequestException(
        `المبلغ (${amount}) يفوق المتبقي على الفاتورة (${remaining.toFixed(2)})`,
      );
    }

    await this.prisma.payment.create({
      data: { companyId, invoiceId, amount, method, createdBy: actorId },
    });

    const newPaid = alreadyPaid + amount;
    const newStatus = newPaid >= invoice.totalAmount - 0.001 ? 'PAID' : 'PARTIALLY_PAID';

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: newStatus },
      include: INVOICE_INCLUDE,
    });
  }

  // ---------------------------------------------------------------
  // SUPPLIER BILLS (Payables) — mirrors createInvoiceFromOrder, but for
  // amounts owed TO suppliers. Auto-generated once a purchase order is
  // fully received; never created standalone (closes docs/FULL-SYSTEM-
  // AUDIT.md §5 "Supplier Bills/Payments" gap).
  // ---------------------------------------------------------------
  async createBillFromPurchaseOrder(companyId: string, po: {
    id: string; supplierId: string;
    items: { quantityOrdered: number; unitCost: number }[];
  }) {
    const existing = await this.prisma.bill.findUnique({ where: { purchaseOrderId: po.id } });
    if (existing) throw new ConflictException('تم إصدار فاتورة مورد لهذا الطلب من قبل');

    const totalAmount = po.items.reduce((sum, i) => sum + i.quantityOrdered * i.unitCost, 0);
    const billNumber = await this.nextBillNumber(companyId);

    return this.prisma.bill.create({
      data: {
        companyId,
        purchaseOrderId: po.id,
        supplierId: po.supplierId,
        billNumber,
        totalAmount,
        status: 'UNPAID',
        dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
      include: { supplier: true, supplierPayments: true, purchaseOrder: true },
    });
  }

  private async nextBillNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.bill.count({
      where: { companyId, billNumber: { startsWith: `BILL-${year}-` } },
    });
    return `BILL-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async listBills(companyId: string) {
    return this.prisma.bill.findMany({
      where: { companyId },
      include: { supplier: true, supplierPayments: true, purchaseOrder: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findBill(companyId: string, id: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, companyId },
      include: { supplier: true, supplierPayments: true, purchaseOrder: true },
    });
    if (!bill) throw new NotFoundException('فاتورة المورد غير موجودة');
    return bill;
  }

  async recordSupplierPayment(companyId: string, actorId: string, billId: string, amount: number, method?: string) {
    const bill = await this.findBill(companyId, billId);
    if (bill.status === 'CANCELLED') throw new BadRequestException('لا يمكن تسجيل دفعة على فاتورة ملغاة');

    const alreadyPaid = bill.supplierPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
    const remaining = bill.totalAmount - alreadyPaid;
    if (amount > remaining + 0.001) {
      throw new BadRequestException(
        `المبلغ (${amount}) يفوق المتبقي على فاتورة المورد (${remaining.toFixed(2)})`,
      );
    }

    await this.prisma.supplierPayment.create({
      data: { companyId, billId, amount, method, createdBy: actorId },
    });

    const newPaid = alreadyPaid + amount;
    const newStatus = newPaid >= bill.totalAmount - 0.001 ? 'PAID' : 'PARTIALLY_PAID';

    return this.prisma.bill.update({
      where: { id: billId },
      data: { status: newStatus },
      include: { supplier: true, supplierPayments: true, purchaseOrder: true },
    });
  }

  // ---------------------------------------------------------------
  // DASHBOARD AGGREGATES (PHASE 37) — real numbers derived from actual
  // invoices/payments, never mocked.
  // ---------------------------------------------------------------
  async getFinancialSummary(companyId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { not: 'CANCELLED' } },
      include: { payments: true },
    });

    const revenue = invoices.reduce((sum: number, inv: any) => sum + inv.totalAmount, 0);
    const cost = invoices.reduce((sum: number, inv: any) => sum + inv.costAmount, 0);
    const grossProfit = revenue - cost;
    const marginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const receivables = invoices.reduce((sum: number, inv: any) => {
      const paid = inv.payments.reduce((s: number, p: any) => s + p.amount, 0);
      return sum + Math.max(0, inv.totalAmount - paid);
    }, 0);

    const overdueReceivables = invoices
      .filter((inv: any) => inv.dueDate && inv.dueDate < new Date() && inv.status !== 'PAID')
      .reduce((sum: number, inv: any) => {
        const paid = inv.payments.reduce((s: number, p: any) => s + p.amount, 0);
        return sum + Math.max(0, inv.totalAmount - paid);
      }, 0);

    const bills = await this.prisma.bill.findMany({
      where: { companyId, status: { not: 'CANCELLED' } },
      include: { supplierPayments: true },
    });
    const payables = bills.reduce((sum: number, bill: any) => {
      const paid = bill.supplierPayments.reduce((s: number, p: any) => s + p.amount, 0);
      return sum + Math.max(0, bill.totalAmount - paid);
    }, 0);

    return { revenue, cost, grossProfit, marginPercent, receivables, overdueReceivables, payables, invoiceCount: invoices.length };
  }
}
