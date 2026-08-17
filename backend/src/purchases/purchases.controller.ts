import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePurchaseOrderDto, ReceivePurchaseOrderDto } from './dto/purchases.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get('orders')
  @RequirePermissions('purchases.view')
  list(@CurrentUser() user: any) {
    return this.purchases.list(user.companyId);
  }

  @Get('orders/:id')
  @RequirePermissions('purchases.view')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.purchases.findOne(user.companyId, id);
  }

  @Post('orders')
  @RequirePermissions('purchases.create')
  create(@CurrentUser() user: any, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchases.create(user.companyId, user.sub, dto);
  }

  @Post('orders/:id/confirm')
  @RequirePermissions('purchases.approve')
  order(@CurrentUser() user: any, @Param('id') id: string) {
    return this.purchases.order(user.companyId, user.sub, id);
  }

  @Post('orders/:id/cancel')
  @RequirePermissions('purchases.approve')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.purchases.cancel(user.companyId, user.sub, id);
  }

  @Post('orders/:id/receive')
  @RequirePermissions('purchases.view') // fine-grained stock.receive check happens inside the service
  receive(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) {
    const isSuperAdmin = user.roles?.includes('SUPER_ADMIN');
    return this.purchases.receive(user.companyId, user.sub, user.permissions ?? [], isSuperAdmin, id, dto);
  }
}
