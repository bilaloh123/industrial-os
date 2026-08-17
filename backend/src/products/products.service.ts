import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateBrandDto, CreateCategoryDto, CreateAttributeDefinitionDto, CreateProductDto, CreateVariantDto } from './dto/products.dto';

const PRODUCT_INCLUDE = {
  brand: true,
  category: true,
  attributeValues: { include: { attributeDefinition: true } },
  variants: { where: { isActive: true } },
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // BRANDS
  // ---------------------------------------------------------------
  listBrands(companyId: string) {
    return this.prisma.brand.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async createBrand(companyId: string, dto: CreateBrandDto) {
    const existing = await this.prisma.brand.findUnique({
      where: { companyId_name: { companyId, name: dto.name } },
    });
    if (existing) throw new ConflictException('هذه الماركة موجودة بالفعل');
    return this.prisma.brand.create({ data: { companyId, name: dto.name } });
  }

  // ---------------------------------------------------------------
  // CATEGORIES
  // ---------------------------------------------------------------
  listCategories(companyId: string) {
    return this.prisma.productCategory.findMany({
      where: { companyId },
      include: { children: true },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(companyId: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.productCategory.findUnique({
      where: { companyId_name: { companyId, name: dto.name } },
    });
    if (existing) throw new ConflictException('هذه الفئة موجودة بالفعل');
    if (dto.parentId) {
      const parent = await this.prisma.productCategory.findFirst({
        where: { id: dto.parentId, companyId },
      });
      if (!parent) throw new NotFoundException('الفئة الأب غير موجودة');
    }
    return this.prisma.productCategory.create({
      data: { companyId, name: dto.name, parentId: dto.parentId },
    });
  }

  // ---------------------------------------------------------------
  // DYNAMIC ATTRIBUTE DEFINITIONS (PHASE 10)
  // ---------------------------------------------------------------
  listAttributeDefinitions(companyId: string, categoryId?: string) {
    return this.prisma.attributeDefinition.findMany({
      where: { companyId, ...(categoryId ? { categoryId } : {}) },
      orderBy: { label: 'asc' },
    });
  }

  async createAttributeDefinition(companyId: string, dto: CreateAttributeDefinitionDto) {
    if (dto.categoryId) {
      const category = await this.prisma.productCategory.findFirst({
        where: { id: dto.categoryId, companyId },
      });
      if (!category) throw new NotFoundException('الفئة غير موجودة');
    }
    const existing = await this.prisma.attributeDefinition.findUnique({
      where: {
        companyId_categoryId_key: {
          companyId,
          categoryId: dto.categoryId ?? null,
          key: dto.key,
        } as any,
      },
    }).catch(() => null);
    if (existing) throw new ConflictException('هذه الخاصية موجودة بالفعل لهذه الفئة');

    return this.prisma.attributeDefinition.create({
      data: {
        companyId,
        categoryId: dto.categoryId,
        key: dto.key,
        label: dto.label,
        type: dto.type ?? 'STRING',
        unit: dto.unit,
      },
    });
  }

  // ---------------------------------------------------------------
  // PRODUCTS (PHASE 9)
  // ---------------------------------------------------------------
  async list(companyId: string) {
    return this.prisma.product.findMany({
      where: { companyId, deletedAt: null },
      include: PRODUCT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(companyId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId, deletedAt: null },
      include: PRODUCT_INCLUDE,
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    return product;
  }

  async create(companyId: string, actorId: string, dto: CreateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { companyId_internalRef: { companyId, internalRef: dto.internalRef } },
    });
    if (existing) throw new ConflictException('المرجع الداخلي مستخدم بالفعل');

    const { attributeValues, ...productData } = dto;

    const product = await this.prisma.product.create({
      data: {
        companyId,
        createdBy: actorId,
        ...productData,
        ...(attributeValues?.length
          ? {
              attributeValues: {
                create: attributeValues.map((av) => ({
                  attributeDefinitionId: av.attributeDefinitionId,
                  value: av.value,
                })),
              },
            }
          : {}),
      },
      include: PRODUCT_INCLUDE,
    });

    await this.prisma.auditLog.create({
      data: {
        companyId,
        userId: actorId,
        action: 'CREATE',
        entity: 'Product',
        entityId: product.id,
        newValue: { internalRef: product.internalRef, name: product.name },
      },
    });

    return product;
  }

  async archive(companyId: string, actorId: string, id: string) {
    await this.findOne(companyId, id); // tenant-scoped existence check
    await this.prisma.product.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { companyId, userId: actorId, action: 'UPDATE', entity: 'Product', entityId: id, reason: 'archive' },
    });
    return { success: true };
  }

  // ---------------------------------------------------------------
  // PRODUCT VARIANTS (PHASE 9) — same product family, different SKUs
  // distinguished by specific attribute values (e.g. inner diameter).
  // ---------------------------------------------------------------
  async listVariants(companyId: string, productId: string) {
    await this.findOne(companyId, productId); // tenant-scoped existence check
    return this.prisma.productVariant.findMany({
      where: { productId },
      include: { attributeValues: { include: { attributeDefinition: true } } },
      orderBy: { sku: 'asc' },
    });
  }

  async createVariant(companyId: string, productId: string, dto: CreateVariantDto) {
    await this.findOne(companyId, productId); // tenant-scoped existence check

    const existing = await this.prisma.productVariant.findUnique({
      where: { productId_sku: { productId, sku: dto.sku } },
    });
    if (existing) throw new ConflictException('هذا الـ SKU مستخدم بالفعل لهذا المنتج');

    return this.prisma.productVariant.create({
      data: {
        productId,
        sku: dto.sku,
        sellingPrice: dto.sellingPrice,
        purchaseCost: dto.purchaseCost,
        ...(dto.attributeValues?.length
          ? {
              attributeValues: {
                create: dto.attributeValues.map((av) => ({
                  attributeDefinitionId: av.attributeDefinitionId,
                  value: av.value,
                })),
              },
            }
          : {}),
      },
      include: { attributeValues: { include: { attributeDefinition: true } } },
    });
  }

  async archiveVariant(companyId: string, productId: string, variantId: string) {
    await this.findOne(companyId, productId);
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) throw new NotFoundException('التركيبة (Variant) غير موجودة');
    return this.prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
  }

  // ---------------------------------------------------------------
  // SMART TECHNICAL SEARCH (PHASE 11)
  // "roulement 25 52" / "25x52x15" / "flexible 1/2 250 bar" all match
  // via per-token OR across ref/name/brand/category/barcode/attribute
  // values, ANDed together across tokens.
  // ---------------------------------------------------------------
  async search(companyId: string, query: string) {
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/[\s×x,]+/) // splits "25x52x15" and "25×52×15" into ["25","52","15"] too
      .filter(Boolean);

    if (!tokens.length) return [];

    const AND = tokens.map((token) => ({
      OR: [
        { internalRef: { contains: token, mode: 'insensitive' as const } },
        { supplierRef: { contains: token, mode: 'insensitive' as const } },
        { barcode: { contains: token, mode: 'insensitive' as const } },
        { name: { contains: token, mode: 'insensitive' as const } },
        { description: { contains: token, mode: 'insensitive' as const } },
        { brand: { name: { contains: token, mode: 'insensitive' as const } } },
        { category: { name: { contains: token, mode: 'insensitive' as const } } },
        { attributeValues: { some: { value: { contains: token, mode: 'insensitive' as const } } } },
        { variants: { some: { sku: { contains: token, mode: 'insensitive' as const } } } },
        { variants: { some: { attributeValues: { some: { value: { contains: token, mode: 'insensitive' as const } } } } } },
      ],
    }));

    return this.prisma.product.findMany({
      where: { companyId, deletedAt: null, AND },
      include: { ...PRODUCT_INCLUDE, variants: { include: { attributeValues: { include: { attributeDefinition: true } } } } },
      take: 30,
    });
  }
}
