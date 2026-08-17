import { Controller, Get, Post, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ExcelService } from './excel.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendXlsx(res: Response, buffer: Buffer, filename: string) {
  res.set({
    'Content-Type': XLSX_MIME,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length,
  });
  res.send(buffer);
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/excel')
export class ExcelController {
  constructor(private readonly excel: ExcelService) {}

  @Get('products/export')
  @RequirePermissions('products.view')
  async exportProducts(@CurrentUser() user: any, @Res() res: Response) {
    sendXlsx(res, await this.excel.exportProducts(user.companyId), 'produits.xlsx');
  }

  @Get('products/import-template')
  @RequirePermissions('products.create')
  async importTemplate(@Res() res: Response) {
    sendXlsx(res, await this.excel.downloadImportTemplate(), 'modele-import-produits.xlsx');
  }

  @Post('products/import')
  @RequirePermissions('products.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importProducts(@CurrentUser() user: any, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('لم يتم إرفاق أي ملف');
    return this.excel.importProducts(user.companyId, user.sub, file.buffer);
  }

  @Get('stock/export')
  @RequirePermissions('stock.view')
  async exportStock(@CurrentUser() user: any, @Res() res: Response) {
    sendXlsx(res, await this.excel.exportStockSummary(user.companyId), 'stock.xlsx');
  }

  @Get('sales/export')
  @RequirePermissions('sales.view')
  async exportSales(@CurrentUser() user: any, @Res() res: Response) {
    sendXlsx(res, await this.excel.exportSalesOrders(user.companyId), 'ventes.xlsx');
  }

  @Get('purchases/export')
  @RequirePermissions('purchases.view')
  async exportPurchases(@CurrentUser() user: any, @Res() res: Response) {
    sendXlsx(res, await this.excel.exportPurchaseOrders(user.companyId), 'achats.xlsx');
  }
}
