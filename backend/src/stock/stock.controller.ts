import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { StockService } from './stock.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateWarehouseDto, CreateZoneDto, CreateRackDto, CreateShelfDto, CreateBinDto, RecordMovementDto } from './dto/stock.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('warehouses')
  @RequirePermissions('stock.view')
  listWarehouses(@CurrentUser() user: any) {
    return this.stock.listWarehouses(user.companyId);
  }

  // RBAC gap closed (see docs/FULL-SYSTEM-AUDIT.md §4): creating physical
  // storage structure is an admin-adjacent action — it now requires the
  // dedicated `stock.manage_locations` permission instead of the much
  // broader `stock.view`, so a plain viewer can no longer create warehouses.
  @Post('warehouses')
  @RequirePermissions('stock.manage_locations')
  createWarehouse(@CurrentUser() user: any, @Body() dto: CreateWarehouseDto) {
    return this.stock.createWarehouse(user.companyId, dto);
  }

  @Post('warehouses/:id/zones')
  @RequirePermissions('stock.manage_locations')
  createZone(@CurrentUser() user: any, @Param('id') warehouseId: string, @Body() dto: CreateZoneDto) {
    return this.stock.createZone(user.companyId, warehouseId, dto);
  }

  @Post('zones/:id/racks')
  @RequirePermissions('stock.manage_locations')
  createRack(@CurrentUser() user: any, @Param('id') zoneId: string, @Body() dto: CreateRackDto) {
    return this.stock.createRack(user.companyId, zoneId, dto);
  }

  @Post('racks/:id/shelves')
  @RequirePermissions('stock.manage_locations')
  createShelf(@CurrentUser() user: any, @Param('id') rackId: string, @Body() dto: CreateShelfDto) {
    return this.stock.createShelf(user.companyId, rackId, dto);
  }

  @Post('shelves/:id/bins')
  @RequirePermissions('stock.manage_locations')
  createBin(@CurrentUser() user: any, @Param('id') shelfId: string, @Body() dto: CreateBinDto) {
    return this.stock.createBin(user.companyId, shelfId, dto);
  }

  // Movement type determines the actually-required permission (see
  // StockService.MOVEMENT_PERMISSION) — the route guard only ensures the
  // caller has at least baseline stock access.
  @Post('movements')
  @RequirePermissions('stock.view')
  recordMovement(@CurrentUser() user: any, @Body() dto: RecordMovementDto) {
    const isSuperAdmin = user.roles?.includes('SUPER_ADMIN');
    return this.stock.recordMovement(user.companyId, user.sub, user.permissions ?? [], isSuperAdmin, dto);
  }

  @Get('movements')
  @RequirePermissions('stock.view')
  listMovements(
    @CurrentUser() user: any,
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.stock.listMovements(user.companyId, { productId, warehouseId });
  }

  @Get('summary')
  @RequirePermissions('stock.view')
  getSummary(@CurrentUser() user: any) {
    return this.stock.getStockSummary(user.companyId);
  }

  @Get('summary/variants/:productId')
  @RequirePermissions('stock.view')
  getVariantSummary(@CurrentUser() user: any, @Param('productId') productId: string) {
    return this.stock.getVariantStockSummary(user.companyId, productId);
  }
}
