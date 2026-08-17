import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users.manage')
  list(@CurrentUser() user: any) {
    return this.users.list(user.companyId);
  }

  @Get(':id')
  @RequirePermissions('users.manage')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.users.findOne(user.companyId, id);
  }

  @Post()
  @RequirePermissions('users.manage')
  invite(@CurrentUser() user: any, @Body() body: any) {
    return this.users.invite(user.companyId, user.sub, body);
  }

  @Patch(':id/active')
  @RequirePermissions('users.manage')
  setActive(@CurrentUser() user: any, @Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.users.setActive(user.companyId, user.sub, id, isActive);
  }

  @Patch(':id/delete')
  @RequirePermissions('users.manage')
  softDelete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.users.softDelete(user.companyId, user.sub, id);
  }
}
