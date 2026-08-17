import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StockService } from '../stock/stock.service';
import { CreateImportDto, AddImportExpenseDto } from './dto/imports.dto';

const IMPORT_INCLUDE = {
  purchaseOrder: { include: { supplier: true, items: { include: { product: true } } } },
  expenses: true,
} as const;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  async list(companyId: string) {
    return this.prisma.import.findMany({
      where: { companyId },
      include: IMPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(companyId: string, id: string) {
    const imp = await this.prisma.import.findFirst({ where: { id, companyId }, include: IMPORT_INCLUDE });
    if (!imp) throw new NotFoundException('ملف الاستيراد غير موجود');
    return imp;
  }

  // ---------------------------------------------------------------
  // CREATE (PHASE 16) — one Import dossier per PurchaseOrder, same
  // traceability pattern as Invoice/Bill.
  // ---------------------------------------------------------------
  async create(companyId: string, actorId: string, dto: CreateImportDto) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id: dto.purchaseOrderId, companyId } });
    if (!po) throw new NotFoundException('طلب الشراء غير موجود');
    if (po.status === 'DRAFT' || po.status === 'CANCELLED') {
      throw new BadRequestException('لا يمكن ربط ملف استيراد بطلب شراء لم يُؤكَّد بعد');
    }

    const existing = await this.prisma.import.findUnique({ where: { purchaseOrderId: dto.purchaseOrderId } });
    if (existing) throw new ConflictException('يوجد ملف استيراد مرتبط بهذا الطلب من قبل');

    const importNumber = await this.nextImportNumber(companyId);

    const imp = await this.prisma.import.create({
      data: {
        companyId,
        purchaseOrderId: dto.purchaseOrderId,
        importNumber,
        status: 'DRAFT',
        countryOfOrigin: dto.countryOfOrigin,
        portOfDeparture: dto.portOfDeparture,
        portOfArrival: dto.portOfArrival,
        carrier: dto.carrier,
        incoterm: dto.incoterm,
      },
      include: IMPORT_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: { companyId, userId: actorId, action: 'CREATE', entity: 'Import', entityId: imp.id, newValue: { purchaseOrderId: dto.purchaseOrderId } },
    });

    return imp;
  }

  private async nextImportNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.import.count({ where: { companyId, importNumber: { startsWith: `IMP-${year}-` } } });
    return `IMP-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  // ---------------------------------------------------------------
  // ADD EXPENSE (PHASE 17) — Freight, Insurance, Customs, Transit,
  // Port Fees, Handling, Bank Fees, Documentation, Storage, Other.
  // ---------------------------------------------------------------
  async addExpense(companyId: string, id: string, dto: AddImportExpenseDto) {
    await this.findOne(companyId, id); // tenant-scoped existence check
    return this.prisma.importExpense.create({
      data: { importId: id, type: dto.type, amount: dto.amount, currency: dto.currency ?? 'MAD', notes: dto.notes },
    });
  }

  // ---------------------------------------------------------------
  // TRUE LANDED COST ENGINE (PHASE 17) — "By Value" allocation method:
  // total import expenses are distributed across PO lines proportionally
  // to each line's purchase value, then converted to a per-unit landed
  // cost. Matches the worked example in the spec exactly:
  //   Purchase 100 + Import costs 27 = True Cost 127.
  // ---------------------------------------------------------------
  async computeLandedCost(companyId: string, id: string) {
    const imp = await this.findOne(companyId, id);
    const items = imp.purchaseOrder.items;
    const totalExpenses = imp.expenses.reduce((sum: number, e: any) => sum + e.amount, 0);
    const totalPOValue = items.reduce((sum: any, i: any) => sum + i.quantityOrdered * i.unitCost, 0);

    return items.map((item: any) => {
      const itemValue = item.quantityOrdered * item.unitCost;
      const share = totalPOValue > 0 ? itemValue / totalPOValue : 0;
      const allocatedExpense = share * totalExpenses;
      const landedCostPerUnit = item.unitCost + (item.quantityOrdered > 0 ? allocatedExpense / item.quantityOrdered : 0);
      const marginIfSoldAt = item.product.sellingPrice
        ? ((item.product.sellingPrice - landedCostPerUnit) / item.product.sellingPrice) * 100
        : null;

      return {
        productId: item.productId,
        internalRef: item.product.internalRef,
        quantityOrdered: item.quantityOrdered,
        purchaseCost: item.unitCost,
        allocatedExpensePerUnit: item.quantityOrdered > 0 ? allocatedExpense / item.quantityOrdered : 0,
        trueLandedCost: landedCostPerUnit,
        sellingPrice: item.product.sellingPrice,
        marginPercent: marginIfSoldAt,
      };
    });
  }

  // ---------------------------------------------------------------
  // CLOSE — locks the dossier and pushes the true landed cost into each
  // product's weighted-average cost (refines the raw-PO-cost average that
  // PurchasesService.receive() applied — now includes freight/customs/etc).
  // ---------------------------------------------------------------
  async close(companyId: string, actorId: string, id: string) {
    const imp = await this.findOne(companyId, id);
    if (imp.status === 'CLOSED') throw new BadRequestException('ملف الاستيراد مُغلق بالفعل');

    const landedCosts = await this.computeLandedCost(companyId, id);

    for (const line of landedCosts) {
      const onHand = await this.stock.getOnHand(companyId, line.productId);
      const product = await this.prisma.product.findUnique({ where: { id: line.productId } });
      const priorOnHand = onHand - line.quantityOrdered;
      const priorAvg = product?.averageCost ?? line.trueLandedCost;
      const newAvg = priorOnHand > 0
        ? (priorAvg * priorOnHand + line.trueLandedCost * line.quantityOrdered) / (priorOnHand + line.quantityOrdered)
        : line.trueLandedCost;

      await this.prisma.product.update({
        where: { id: line.productId },
        data: { averageCost: newAvg, lastCost: line.trueLandedCost },
      });
    }

    const updated = await this.prisma.import.update({ where: { id }, data: { status: 'CLOSED' }, include: IMPORT_INCLUDE });

    await this.prisma.auditLog.create({
      data: { companyId, userId: actorId, action: 'UPDATE', entity: 'Import', entityId: id, newValue: { status: 'CLOSED', landedCosts } },
    });

    return updated;
  }

  async advance(companyId: string, actorId: string, id: string, status: string) {
    const imp = await this.findOne(companyId, id);
    if (imp.status === 'CLOSED' || imp.status === 'CANCELLED') {
      throw new BadRequestException('لا يمكن تعديل ملف استيراد مغلق أو ملغى');
    }
    const updated = await this.prisma.import.update({ where: { id }, data: { status: status as any }, include: IMPORT_INCLUDE });
    await this.prisma.auditLog.create({
      data: { companyId, userId: actorId, action: 'UPDATE', entity: 'Import', entityId: id, oldValue: { status: imp.status }, newValue: { status } },
    });
    return updated;
  }
}
