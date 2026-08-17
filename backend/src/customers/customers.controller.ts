import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// RBAC gap closed (see docs/FULL-SYSTEM-AUDIT.md §4): customer records now
// require `customers.view` / `customers.manage`, matching the pattern used
// everywhere else in the app instead of "any logged-in user can access".
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions('customers.view')
  list(@CurrentUser() user: any) {
    return this.customers.list(user.companyId);
  }

  @Get(':id')
  @RequirePermissions('customers.view')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.customers.findOne(user.companyId, id);
  }

  @Post()
  @RequirePermissions('customers.manage')
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.customers.create(user.companyId, body);
  }
}
