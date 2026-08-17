import { Injectable, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma.service';
import { StockService } from '../stock/stock.service';

export type ImportRowError = { row: number; internalRef: string | null; reason: string };
export type ImportReport = { created: number; skipped: number; errors: ImportRowError[] };

@Injectable()
export class ExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
  ) {}

  // ---------------------------------------------------------------
  // EXPORT — Products (PHASE 48)
  // ---------------------------------------------------------------
  async exportProducts(companyId: string): Promise<Buffer> {
    const products = await this.prisma.product.findMany({
      where: { companyId, deletedAt: null },
      include: { category: true, brand: true },
      orderBy: { internalRef: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'INDUSTRIAL OS';
    const ws = wb.addWorksheet('Produits');

    ws.columns = [
      { header: 'Référence interne', key: 'internalRef', width: 20 },
      { header: 'Nom', key: 'name', width: 32 },
      { header: 'Référence fournisseur', key: 'supplierRef', width: 20 },
      { header: 'Catégorie', key: 'category', width: 16 },
      { header: 'Marque', key: 'brand', width: 16 },
      { header: 'Unité', key: 'unit', width: 10 },
      { header: 'Coût moyen', key: 'averageCost', width: 14 },
      { header: 'Prix de vente', key: 'sellingPrice', width: 14 },
      { header: 'Stock min', key: 'minStock', width: 10 },
      { header: 'Point de commande', key: 'reorderPoint', width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14171A' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFECEEF0' } };

    for (const p of products) {
      ws.addRow({
        internalRef: p.internalRef,
        name: p.name,
        supplierRef: p.supplierRef ?? '',
        category: p.category?.name ?? '',
        brand: p.brand?.name ?? '',
        unit: p.unit,
        averageCost: p.averageCost ?? '',
        sellingPrice: p.sellingPrice ?? '',
        minStock: p.minStock,
        reorderPoint: p.reorderPoint,
      });
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ---------------------------------------------------------------
  // EXPORT — Stock summary
  // ---------------------------------------------------------------
  async exportStockSummary(companyId: string): Promise<Buffer> {
    const summary = await this.stock.getStockSummary(companyId);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Stock');
    ws.columns = [
      { header: 'Référence', key: 'internalRef', width: 20 },
      { header: 'Produit', key: 'name', width: 32 },
      { header: 'Stock réel', key: 'onHand', width: 12 },
      { header: 'Réservé', key: 'reserved', width: 12 },
      { header: 'Disponible', key: 'available', width: 12 },
      { header: 'Point de commande', key: 'reorderPoint', width: 16 },
      { header: 'Stock de sécurité', key: 'safetyStock', width: 16 },
      { header: 'État', key: 'health', width: 12 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFECEEF0' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14171A' } };

    for (const s of summary) ws.addRow(s);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ---------------------------------------------------------------
  // EXPORT — Sales orders
  // ---------------------------------------------------------------
  async exportSalesOrders(companyId: string): Promise<Buffer> {
    const orders = await this.prisma.salesOrder.findMany({
      where: { companyId },
      include: { customer: true, items: true },
      orderBy: { createdAt: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ventes');
    ws.columns = [
      { header: 'N° Commande', key: 'id', width: 24 },
      { header: 'Client', key: 'customer', width: 26 },
      { header: 'Statut', key: 'status', width: 14 },
      { header: 'Nb lignes', key: 'items', width: 10 },
      { header: 'Total (MAD)', key: 'total', width: 14 },
      { header: 'Date', key: 'date', width: 14 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFECEEF0' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14171A' } };

    for (const o of orders) {
      const total = o.items.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0);
      ws.addRow({
        id: o.id, customer: o.customer.name, status: o.status,
        items: o.items.length, total, date: o.createdAt.toISOString().slice(0, 10),
      });
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ---------------------------------------------------------------
  // EXPORT — Purchase orders
  // ---------------------------------------------------------------
  async exportPurchaseOrders(companyId: string): Promise<Buffer> {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { companyId },
      include: { supplier: true, items: true },
      orderBy: { createdAt: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Achats');
    ws.columns = [
      { header: 'N° Commande', key: 'id', width: 24 },
      { header: 'Fournisseur', key: 'supplier', width: 26 },
      { header: 'Statut', key: 'status', width: 14 },
      { header: 'Nb lignes', key: 'items', width: 10 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Devise', key: 'currency', width: 10 },
      { header: 'Date', key: 'date', width: 14 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFECEEF0' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14171A' } };

    for (const o of orders) {
      const total = o.items.reduce((s: number, i: any) => s + i.quantityOrdered * i.unitCost, 0);
      ws.addRow({
        id: o.id, supplier: o.supplier.name, status: o.status,
        items: o.items.length, total, currency: o.currency, date: o.createdAt.toISOString().slice(0, 10),
      });
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ---------------------------------------------------------------
  // TEMPLATE — blank importable file with headers + one example row,
  // so users know exactly what format to fill in (PHASE 48).
  // ---------------------------------------------------------------
  async downloadImportTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Produits');
    ws.columns = [
      { header: 'internalRef', key: 'internalRef', width: 20 },
      { header: 'name', key: 'name', width: 32 },
      { header: 'unit', key: 'unit', width: 10 },
      { header: 'sellingPrice', key: 'sellingPrice', width: 14 },
      { header: 'purchaseCost', key: 'purchaseCost', width: 14 },
      { header: 'minStock', key: 'minStock', width: 10 },
      { header: 'reorderPoint', key: 'reorderPoint', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow({ internalRef: 'RLM-6205-2RS', name: 'Roulement à billes', unit: 'PCE', sellingPrice: 96, purchaseCost: 82, minStock: 10, reorderPoint: 50 });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ---------------------------------------------------------------
  // IMPORT — Products (PHASE 48): "Large imports: Background Job,
  // Progress Bar, Validation, Error Report". No job queue infra exists
  // yet, so this runs synchronously — but validation and the per-row
  // error report are real, matching the spec's core requirement.
  // ---------------------------------------------------------------
  async importProducts(companyId: string, actorId: string, fileBuffer: Buffer): Promise<ImportReport> {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(fileBuffer as any);
    } catch {
      throw new BadRequestException('الملف غير صالح — يجب أن يكون بصيغة xlsx');
    }

    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('الملف لا يحتوي على أي ورقة بيانات');

    const headerRow = ws.getRow(1).values as any[];
    const colIndex = (name: string) => headerRow.findIndex((h) => String(h).trim().toLowerCase() === name.toLowerCase());

    const idxRef = colIndex('internalRef');
    const idxName = colIndex('name');
    if (idxRef === -1 || idxName === -1) {
      throw new BadRequestException('الملف يجب أن يحتوي على أعمدة "internalRef" و"name" على الأقل');
    }
    const idxUnit = colIndex('unit');
    const idxSellingPrice = colIndex('sellingPrice');
    const idxPurchaseCost = colIndex('purchaseCost');
    const idxMinStock = colIndex('minStock');
    const idxReorderPoint = colIndex('reorderPoint');

    const report: ImportReport = { created: 0, skipped: 0, errors: [] };

    for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
      const row = ws.getRow(rowNumber);
      if (row.values === undefined || (row.values as any[]).length === 0) continue; // blank row

      const internalRef = String(row.getCell(idxRef).value ?? '').trim();
      const name = String(row.getCell(idxName).value ?? '').trim();

      if (!internalRef || !name) {
        report.errors.push({ row: rowNumber, internalRef: internalRef || null, reason: 'المرجع الداخلي والاسم إلزاميان' });
        report.skipped++;
        continue;
      }

      const existing = await this.prisma.product.findUnique({
        where: { companyId_internalRef: { companyId, internalRef } },
      });
      if (existing) {
        report.errors.push({ row: rowNumber, internalRef, reason: 'المرجع الداخلي مستخدم بالفعل — تم تجاهل السطر' });
        report.skipped++;
        continue;
      }

      try {
        await this.prisma.product.create({
          data: {
            companyId,
            createdBy: actorId,
            internalRef,
            name,
            unit: idxUnit > -1 ? String(row.getCell(idxUnit).value ?? 'PCE') || 'PCE' : 'PCE',
            sellingPrice: idxSellingPrice > -1 ? toNumberOrUndefined(row.getCell(idxSellingPrice).value) : undefined,
            purchaseCost: idxPurchaseCost > -1 ? toNumberOrUndefined(row.getCell(idxPurchaseCost).value) : undefined,
            minStock: idxMinStock > -1 ? toNumberOrUndefined(row.getCell(idxMinStock).value) ?? 0 : 0,
            reorderPoint: idxReorderPoint > -1 ? toNumberOrUndefined(row.getCell(idxReorderPoint).value) ?? 0 : 0,
          },
        });
        report.created++;
      } catch (err: any) {
        report.errors.push({ row: rowNumber, internalRef, reason: 'خطأ غير متوقع أثناء الإنشاء' });
        report.skipped++;
      }
    }

    await this.prisma.auditLog.create({
      data: {
        companyId, userId: actorId, action: 'CREATE', entity: 'Product',
        reason: 'bulk_import', newValue: { created: report.created, skipped: report.skipped },
      },
    });

    return report;
  }
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
