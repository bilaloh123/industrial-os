import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get('me')
  getMyCompany(@CurrentUser() user: any) {
    return this.companies.getMyCompany(user.companyId);
  }

  @Patch('me')
  @RequirePermissions('settings.manage')
  updateMyCompany(@CurrentUser() user: any, @Body() body: any) {
    return this.companies.updateMyCompany(user.companyId, body);
  }
}
