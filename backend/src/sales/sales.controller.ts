import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSalesOrderDto, DeliverOrderDto } from './dto/sales.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('orders')
  @RequirePermissions('sales.view')
  list(@CurrentUser() user: any) {
    return this.sales.list(user.companyId);
  }

  @Get('orders/:id')
  @RequirePermissions('sales.view')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.sales.findOne(user.companyId, id);
  }

  @Post('orders')
  @RequirePermissions('sales.create')
  create(@CurrentUser() user: any, @Body() dto: CreateSalesOrderDto) {
    return this.sales.create(user.companyId, user.sub, dto);
  }

  @Post('orders/:id/confirm')
  @RequirePermissions('sales.approve')
  confirm(@CurrentUser() user: any, @Param('id') id: string) {
    return this.sales.confirm(user.companyId, user.sub, id);
  }

  @Post('orders/:id/cancel')
  @RequirePermissions('sales.cancel')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.sales.cancel(user.companyId, user.sub, id);
  }

  @Post('orders/:id/advance/:status')
  @RequirePermissions('sales.create')
  advance(@CurrentUser() user: any, @Param('id') id: string, @Param('status') status: string) {
    return this.sales.advance(user.companyId, user.sub, id, status);
  }

  @Post('orders/:id/deliver')
  @RequirePermissions('sales.create')
  deliver(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: DeliverOrderDto) {
    const isSuperAdmin = user.roles?.includes('SUPER_ADMIN');
    return this.sales.deliver(user.companyId, user.sub, user.permissions ?? [], isSuperAdmin, id, dto.warehouseId);
  }

  @Post('orders/:id/invoice')
  @RequirePermissions('sales.approve')
  invoice(@CurrentUser() user: any, @Param('id') id: string) {
    return this.sales.invoice(user.companyId, user.sub, id);
  }
}
