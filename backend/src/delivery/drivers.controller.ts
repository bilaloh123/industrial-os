import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateDriverDto } from './dto/delivery.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  @RequirePermissions('delivery.view')
  list(@CurrentUser() user: any) {
    return this.drivers.list(user.companyId);
  }

  @Post()
  @RequirePermissions('delivery.manage')
  create(@CurrentUser() user: any, @Body() dto: CreateDriverDto) {
    return this.drivers.create(user.companyId, dto);
  }

  @Patch(':id/active')
  @RequirePermissions('delivery.manage')
  setActive(@CurrentUser() user: any, @Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.drivers.setActive(user.companyId, id, isActive);
  }
}
