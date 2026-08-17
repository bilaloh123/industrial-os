import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateBrandDto, CreateCategoryDto, CreateAttributeDefinitionDto, CreateProductDto, CreateVariantDto } from './dto/products.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // ---- brands ----
  @Get('brands')
  @RequirePermissions('products.view')
  listBrands(@CurrentUser() user: any) {
    return this.products.listBrands(user.companyId);
  }

  @Post('brands')
  @RequirePermissions('products.create')
  createBrand(@CurrentUser() user: any, @Body() dto: CreateBrandDto) {
    return this.products.createBrand(user.companyId, dto);
  }

  // ---- categories ----
  @Get('categories')
  @RequirePermissions('products.view')
  listCategories(@CurrentUser() user: any) {
    return this.products.listCategories(user.companyId);
  }

  @Post('categories')
  @RequirePermissions('products.create')
  createCategory(@CurrentUser() user: any, @Body() dto: CreateCategoryDto) {
    return this.products.createCategory(user.companyId, dto);
  }

  // ---- dynamic attribute definitions ----
  @Get('attributes')
  @RequirePermissions('products.view')
  listAttributes(@CurrentUser() user: any, @Query('categoryId') categoryId?: string) {
    return this.products.listAttributeDefinitions(user.companyId, categoryId);
  }

  @Post('attributes')
  @RequirePermissions('products.create')
  createAttribute(@CurrentUser() user: any, @Body() dto: CreateAttributeDefinitionDto) {
    return this.products.createAttributeDefinition(user.companyId, dto);
  }

  // ---- smart technical search (must be declared before ':id') ----
  @Get('search')
  @RequirePermissions('products.view')
  search(@CurrentUser() user: any, @Query('q') q: string) {
    return this.products.search(user.companyId, q ?? '');
  }

  // ---- products ----
  @Get()
  @RequirePermissions('products.view')
  list(@CurrentUser() user: any) {
    return this.products.list(user.companyId);
  }

  @Get(':id')
  @RequirePermissions('products.view')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.products.findOne(user.companyId, id);
  }

  @Post()
  @RequirePermissions('products.create')
  create(@CurrentUser() user: any, @Body() dto: CreateProductDto) {
    return this.products.create(user.companyId, user.sub, dto);
  }

  @Patch(':id/archive')
  @RequirePermissions('products.archive')
  archive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.products.archive(user.companyId, user.sub, id);
  }

  // ---- product variants (PHASE 9) ----
  @Get(':id/variants')
  @RequirePermissions('products.view')
  listVariants(@CurrentUser() user: any, @Param('id') id: string) {
    return this.products.listVariants(user.companyId, id);
  }

  @Post(':id/variants')
  @RequirePermissions('products.create')
  createVariant(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.products.createVariant(user.companyId, id, dto);
  }

  @Patch(':id/variants/:variantId/archive')
  @RequirePermissions('products.archive')
  archiveVariant(@CurrentUser() user: any, @Param('id') id: string, @Param('variantId') variantId: string) {
    return this.products.archiveVariant(user.companyId, id, variantId);
  }
}
