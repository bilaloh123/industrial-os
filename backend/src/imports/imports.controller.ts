import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ImportsService } from './imports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateImportDto, AddImportExpenseDto } from './dto/imports.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  @RequirePermissions('imports.view')
  list(@CurrentUser() user: any) {
    return this.imports.list(user.companyId);
  }

  @Get(':id')
  @RequirePermissions('imports.view')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.imports.findOne(user.companyId, id);
  }

  @Post()
  @RequirePermissions('imports.create')
  create(@CurrentUser() user: any, @Body() dto: CreateImportDto) {
    return this.imports.create(user.companyId, user.sub, dto);
  }

  @Post(':id/expenses')
  @RequirePermissions('imports.edit')
  addExpense(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AddImportExpenseDto) {
    return this.imports.addExpense(user.companyId, id, dto);
  }

  @Get(':id/landed-cost')
  @RequirePermissions('imports.view')
  landedCost(@CurrentUser() user: any, @Param('id') id: string) {
    return this.imports.computeLandedCost(user.companyId, id);
  }

  @Post(':id/advance/:status')
  @RequirePermissions('imports.edit')
  advance(@CurrentUser() user: any, @Param('id') id: string, @Param('status') status: string) {
    return this.imports.advance(user.companyId, user.sub, id, status);
  }

  @Post(':id/close')
  @RequirePermissions('imports.close')
  close(@CurrentUser() user: any, @Param('id') id: string) {
    return this.imports.close(user.companyId, user.sub, id);
  }
}
