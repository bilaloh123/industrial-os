import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('invoices/:id/pdf')
  @RequirePermissions('finance.view')
  async invoicePdf(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const buffer = await this.documents.buildInvoicePdf(user.companyId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="facture-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get('purchase-orders/:id/pdf')
  @RequirePermissions('purchases.view')
  async purchaseOrderPdf(@CurrentUser() user: any, @Param('id') id: string, @Res() res: Response) {
    const buffer = await this.documents.buildPurchaseOrderPdf(user.companyId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="bon-commande-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
