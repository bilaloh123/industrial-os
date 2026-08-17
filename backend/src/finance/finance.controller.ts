import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RecordPaymentDto } from './dto/finance.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('invoices')
  @RequirePermissions('finance.view')
  list(@CurrentUser() user: any) {
    return this.finance.list(user.companyId);
  }

  @Get('invoices/:id')
  @RequirePermissions('finance.view')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.finance.findOne(user.companyId, id);
  }

  @Post('invoices/:id/payments')
  @RequirePermissions('finance.create')
  recordPayment(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.finance.recordPayment(user.companyId, user.sub, id, dto.amount, dto.method);
  }

  @Get('summary')
  @RequirePermissions('finance.view')
  getSummary(@CurrentUser() user: any) {
    return this.finance.getFinancialSummary(user.companyId);
  }

  // ---- Supplier bills (Payables) ----
  @Get('bills')
  @RequirePermissions('finance.view')
  listBills(@CurrentUser() user: any) {
    return this.finance.listBills(user.companyId);
  }

  @Get('bills/:id')
  @RequirePermissions('finance.view')
  findBill(@CurrentUser() user: any, @Param('id') id: string) {
    return this.finance.findBill(user.companyId, id);
  }

  @Post('bills/:id/payments')
  @RequirePermissions('finance.create')
  recordSupplierPayment(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.finance.recordSupplierPayment(user.companyId, user.sub, id, dto.amount, dto.method);
  }
}
