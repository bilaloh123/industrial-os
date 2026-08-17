import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions('purchases.view')
  list(@CurrentUser() user: any) {
    return this.suppliers.list(user.companyId);
  }

  // Static routes must be declared before ':id' so Nest doesn't treat
  // "comparison" as a supplier id.
  @Get('comparison')
  @RequirePermissions('purchases.view')
  compareForProduct(@CurrentUser() user: any, @Query('productId') productId: string) {
    return this.suppliers.compareForProduct(user.companyId, productId);
  }

  @Get(':id')
  @RequirePermissions('purchases.view')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.suppliers.findOne(user.companyId, id);
  }

  @Post()
  @RequirePermissions('purchases.create')
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.suppliers.create(user.companyId, body);
  }

  @Post(':id/offers')
  @RequirePermissions('purchases.create')
  addOffer(@CurrentUser() user: any, @Param('id') supplierId: string, @Body() body: any) {
    return this.suppliers.addOffer(user.companyId, supplierId, body);
  }
}
