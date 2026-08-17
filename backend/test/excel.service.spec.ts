import * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { ExcelService } from '../src/excel/excel.service';
import { StockService } from '../src/stock/stock.service';
import { PrismaService } from '../src/prisma.service';

async function buildImportBuffer(rows: Record<string, any>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Produits');
  ws.columns = [
    { header: 'internalRef', key: 'internalRef' },
    { header: 'name', key: 'name' },
    { header: 'unit', key: 'unit' },
    { header: 'sellingPrice', key: 'sellingPrice' },
    { header: 'purchaseCost', key: 'purchaseCost' },
    { header: 'minStock', key: 'minStock' },
    { header: 'reorderPoint', key: 'reorderPoint' },
  ];
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('ExcelService', () => {
  let service: ExcelService;
  let prisma: any;
  let stock: any;

  beforeEach(() => {
    prisma = {
      product: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn() },
      salesOrder: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseOrder: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn() },
    };
    stock = { getStockSummary: jest.fn().mockResolvedValue([]) };
    service = new ExcelService(prisma as unknown as PrismaService, stock as unknown as StockService);
  });

  describe('exportProducts() — real, well-formed workbook', () => {
    it('produces a readable xlsx buffer with the expected headers and tenant-scoped data', async () => {
      prisma.product.findMany.mockResolvedValue([
        { internalRef: 'RLM-6205', name: 'Roulement', supplierRef: null, category: { name: 'Roulements' }, brand: { name: 'SKF' }, unit: 'PCE', averageCost: 82, sellingPrice: 96, minStock: 10, reorderPoint: 50 },
      ]);

      const buffer = await service.exportProducts('company_A');
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'company_A' }) }),
      );

      // Read the generated file back — proves it's a real, valid xlsx, not a stub.
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);
      const ws = wb.worksheets[0];
      expect(ws.name).toBe('Produits');
      const headerRow = ws.getRow(1).values as any[];
      expect(headerRow).toContain('Référence interne');
      expect(headerRow).toContain('Prix de vente');

      const dataRow = ws.getRow(2).values as any[];
      expect(dataRow).toContain('RLM-6205');
      expect(dataRow).toContain('Roulements');
      expect(dataRow).toContain('SKF');
    });
  });

  describe('exportStockSummary()', () => {
    it('produces a valid workbook from real stock health data', async () => {
      stock.getStockSummary.mockResolvedValue([
        { internalRef: 'A', name: 'Produit A', onHand: 100, reserved: 20, available: 80, reorderPoint: 50, safetyStock: 10, health: 'GREEN' },
      ]);
      const buffer = await service.exportStockSummary('company_A');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);
      expect(wb.worksheets[0].getRow(2).getCell(3).value).toBe(100); // onHand column
    });
  });

  describe('importProducts() — validation & error reporting (PHASE 48)', () => {
    it('rejects a file that is not a valid xlsx', async () => {
      const garbage = Buffer.from('this is not an excel file');
      await expect(service.importProducts('company_A', 'user_1', garbage)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a file missing the required internalRef/name columns', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Sheet1');
      ws.columns = [{ header: 'foo', key: 'foo' }];
      ws.addRow({ foo: 'bar' });
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());

      await expect(service.importProducts('company_A', 'user_1', buffer as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates valid rows and reports rows missing required fields, without stopping the whole import', async () => {
      const buffer = await buildImportBuffer([
        { internalRef: 'RLM-6205', name: 'Roulement à billes', unit: 'PCE', sellingPrice: 96, purchaseCost: 82, minStock: 10, reorderPoint: 50 },
        { internalRef: '', name: 'منتج بلا مرجع' }, // invalid: missing internalRef
        { internalRef: 'CRR-1250', name: 'Courroie' },
      ]);
      prisma.product.findUnique.mockResolvedValue(null); // no duplicates
      prisma.product.create.mockResolvedValue({});

      const report = await service.importProducts('company_A', 'user_1', buffer);

      expect(report.created).toBe(2);
      expect(report.skipped).toBe(1);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].reason).toContain('إلزاميان');
      expect(prisma.product.create).toHaveBeenCalledTimes(2);
    });

    it('skips (does not overwrite) a row whose internalRef already exists, and reports why', async () => {
      const buffer = await buildImportBuffer([
        { internalRef: 'RLM-6205', name: 'Roulement existant' },
      ]);
      prisma.product.findUnique.mockResolvedValue({ id: 'existing_product' }); // duplicate

      const report = await service.importProducts('company_A', 'user_1', buffer);

      expect(report.created).toBe(0);
      expect(report.skipped).toBe(1);
      expect(report.errors[0].reason).toContain('مستخدم بالفعل');
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('scopes every new product to the caller company (tenant isolation)', async () => {
      const buffer = await buildImportBuffer([{ internalRef: 'X-1', name: 'Produit X' }]);
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue({});

      await service.importProducts('company_A', 'user_1', buffer);

      const createCall = prisma.product.create.mock.calls[0][0];
      expect(createCall.data.companyId).toBe('company_A');
      expect(createCall.data.createdBy).toBe('user_1');
    });

    it('defaults minStock/reorderPoint to 0 and unit to PCE when not provided', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Produits');
      ws.columns = [{ header: 'internalRef', key: 'internalRef' }, { header: 'name', key: 'name' }];
      ws.addRow({ internalRef: 'MIN-1', name: 'Produit minimal' });
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());

      prisma.product.findUnique.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue({});

      await service.importProducts('company_A', 'user_1', buffer);
      const createCall = prisma.product.create.mock.calls[0][0];
      expect(createCall.data.unit).toBe('PCE');
      expect(createCall.data.minStock).toBe(0);
      expect(createCall.data.reorderPoint).toBe(0);
    });

    it('logs the bulk import outcome to the audit trail', async () => {
      const buffer = await buildImportBuffer([{ internalRef: 'A-1', name: 'A' }]);
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue({});

      await service.importProducts('company_A', 'user_1', buffer);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reason: 'bulk_import' }) }),
      );
    });
  });

  describe('downloadImportTemplate()', () => {
    it('produces a valid template workbook with an example row', async () => {
      const buffer = await service.downloadImportTemplate();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);
      expect(wb.worksheets[0].rowCount).toBeGreaterThanOrEqual(2); // header + example
    });
  });
});
