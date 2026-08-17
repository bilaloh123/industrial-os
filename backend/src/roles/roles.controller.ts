import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('roles.manage')
  list(@CurrentUser() user: any) {
    return this.roles.list(user.companyId);
  }

  @Get('permissions/catalogue')
  @RequirePermissions('roles.manage')
  catalogue() {
    return this.roles.listAllPermissions();
  }

  @Post()
  @RequirePermissions('roles.manage')
  create(@CurrentUser() user: any, @Body() body: { name: string; description?: string }) {
    return this.roles.create(user.companyId, body.name, body.description);
  }

  @Post(':id/permissions')
  @RequirePermissions('roles.manage')
  setPermissions(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('permissionKeys') permissionKeys: string[],
  ) {
    return this.roles.setPermissions(user.companyId, id, permissionKeys);
  }

  @Post(':id/assign/:userId')
  @RequirePermissions('roles.manage')
  assign(@CurrentUser() user: any, @Param('id') id: string, @Param('userId') userId: string) {
    return this.roles.assignToUser(user.companyId, userId, id);
  }
}
