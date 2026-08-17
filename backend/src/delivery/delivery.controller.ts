import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateDeliveryDto, AssignDriverDto, CompleteDeliveryDto, FailDeliveryDto } from './dto/delivery.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/deliveries')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get()
  @RequirePermissions('delivery.view')
  list(@CurrentUser() user: any) {
    return this.delivery.list(user.companyId);
  }

  @Get(':id')
  @RequirePermissions('delivery.view')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.delivery.findOne(user.companyId, id);
  }

  @Post()
  @RequirePermissions('delivery.manage')
  create(@CurrentUser() user: any, @Body() dto: CreateDeliveryDto) {
    return this.delivery.create(user.companyId, dto);
  }

  @Post(':id/assign-driver')
  @RequirePermissions('delivery.manage')
  assignDriver(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AssignDriverDto) {
    return this.delivery.assignDriver(user.companyId, id, dto.driverId);
  }

  @Post(':id/start-transit')
  @RequirePermissions('delivery.manage')
  startTransit(@CurrentUser() user: any, @Param('id') id: string) {
    return this.delivery.startTransit(user.companyId, user.sub, id);
  }

  @Post(':id/complete')
  @RequirePermissions('delivery.manage')
  complete(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CompleteDeliveryDto) {
    const isSuperAdmin = user.roles?.includes('SUPER_ADMIN');
    return this.delivery.complete(user.companyId, user.sub, user.permissions ?? [], isSuperAdmin, id, dto);
  }

  @Post(':id/fail')
  @RequirePermissions('delivery.manage')
  fail(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: FailDeliveryDto) {
    return this.delivery.fail(user.companyId, id, dto.reason);
  }
}
