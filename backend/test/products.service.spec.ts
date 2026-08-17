import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from '../src/products/products.service';
import { PrismaService } from '../src/prisma.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      brand: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      productCategory: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      attributeDefinition: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      productVariant: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  describe('Smart Technical Search (PHASE 11)', () => {
    it('tokenizes "roulement 25 52" into 3 AND-ed tokens, each ORed across searchable fields', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.search('company_A', 'roulement 25 52');

      const call = prisma.product.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe('company_A');
      expect(call.where.AND).toHaveLength(3);
      // each token clause must OR across ref/name/brand/category/attribute values
      const firstTokenOr = call.where.AND[0].OR;
      expect(firstTokenOr.some((c: any) => c.name?.contains === 'roulement')).toBe(true);
      expect(firstTokenOr.some((c: any) => c.attributeValues?.some?.value?.contains === 'roulement')).toBe(true);
    });

    it('splits dimension strings like "25x52x15" and "25×52×15" into separate numeric tokens', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.search('company_A', '25x52x15');
      let call = prisma.product.findMany.mock.calls[0][0];
      expect(call.where.AND).toHaveLength(3);

      await service.search('company_A', '25×52×15');
      call = prisma.product.findMany.mock.calls[1][0];
      expect(call.where.AND).toHaveLength(3);
    });

    it('returns an empty array without querying the database for a blank query', async () => {
      const result = await service.search('company_A', '   ');
      expect(result).toEqual([]);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('always scopes the search by the caller companyId and excludes soft-deleted products', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.search('company_B', 'flexible');
      const call = prisma.product.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe('company_B');
      expect(call.where.deletedAt).toBeNull();
    });
  });

  describe('create()', () => {
    it('rejects a duplicate internalRef within the same company', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create('company_A', 'user_1', { internalRef: 'RLM-6205', name: 'Roulement' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('creates the product with nested attribute values and writes an audit log', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue({ id: 'prod_1', internalRef: 'RLM-6205', name: 'Roulement' });

      await service.create('company_A', 'user_1', {
        internalRef: 'RLM-6205',
        name: 'Roulement à billes',
        attributeValues: [{ attributeDefinitionId: 'attr_1', value: '25' }],
      } as any);

      const createCall = prisma.product.create.mock.calls[0][0];
      expect(createCall.data.companyId).toBe('company_A');
      expect(createCall.data.createdBy).toBe('user_1');
      expect(createCall.data.attributeValues.create).toEqual([{ attributeDefinitionId: 'attr_1', value: '25' }]);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('cannot read a product belonging to a different company', async () => {
      prisma.product.findFirst.mockResolvedValue(null); // simulates tenant-scoped filter finding nothing
      await expect(service.findOne('company_A', 'prod_from_company_B')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cannot archive a product belonging to a different company', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      await expect(
        service.archive('company_A', 'attacker', 'prod_from_company_B'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('list() always filters by the caller companyId', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.list('company_A');
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'company_A' }) }),
      );
    });
  });

  describe('Dynamic Attribute Engine (PHASE 10)', () => {
    it('rejects creating a category-scoped attribute for a category from another company', async () => {
      prisma.productCategory.findFirst.mockResolvedValue(null);
      await expect(
        service.createAttributeDefinition('company_A', {
          categoryId: 'category_from_company_B',
          key: 'inner_diameter',
          label: 'القطر الداخلي',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a global (non-category-scoped) attribute definition', async () => {
      prisma.attributeDefinition.findUnique.mockResolvedValue(null);
      prisma.attributeDefinition.create.mockResolvedValue({ id: 'attr_new' });

      await service.createAttributeDefinition('company_A', {
        key: 'warranty_months',
        label: 'مدة الضمان',
        type: 'NUMBER',
        unit: 'شهر',
      });

      expect(prisma.attributeDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: 'company_A', key: 'warranty_months', type: 'NUMBER' }),
        }),
      );
    });
  });

  describe('Product Variants (PHASE 9)', () => {
    it('rejects creating a variant for a product belonging to a different company', async () => {
      prisma.product.findFirst.mockResolvedValue(null); // tenant-scoped lookup found nothing
      await expect(
        service.createVariant('company_A', 'prod_from_company_B', { sku: 'RLM-6205-25' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a duplicate SKU within the same product', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1', companyId: 'company_A' });
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'existing_variant' });
      await expect(
        service.createVariant('company_A', 'prod_1', { sku: 'RLM-6205-25' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.productVariant.create).not.toHaveBeenCalled();
    });

    it('creates a variant with nested attribute values (e.g. inner diameter distinguishing it from siblings)', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1', companyId: 'company_A' });
      prisma.productVariant.findUnique.mockResolvedValue(null);
      prisma.productVariant.create.mockResolvedValue({ id: 'var_1', sku: 'RLM-6205-25' });

      await service.createVariant('company_A', 'prod_1', {
        sku: 'RLM-6205-25',
        sellingPrice: 96,
        attributeValues: [{ attributeDefinitionId: 'attr_diameter', value: '25' }],
      } as any);

      const createCall = prisma.productVariant.create.mock.calls[0][0];
      expect(createCall.data.sku).toBe('RLM-6205-25');
      expect(createCall.data.attributeValues.create).toEqual([{ attributeDefinitionId: 'attr_diameter', value: '25' }]);
    });

    it('two variants of the same product can have different attribute values for the same attribute (the whole point of variants)', async () => {
      // sibling A: diameter 25
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1', companyId: 'company_A' });
      prisma.productVariant.findUnique.mockResolvedValueOnce(null);
      prisma.productVariant.create.mockResolvedValueOnce({ id: 'var_A', sku: 'RLM-6205-25' });
      await service.createVariant('company_A', 'prod_1', {
        sku: 'RLM-6205-25', attributeValues: [{ attributeDefinitionId: 'attr_diameter', value: '25' }],
      } as any);

      // sibling B: diameter 30 — same attributeDefinitionId, different value, different SKU -> must succeed
      prisma.productVariant.findUnique.mockResolvedValueOnce(null);
      prisma.productVariant.create.mockResolvedValueOnce({ id: 'var_B', sku: 'RLM-6205-30' });
      await service.createVariant('company_A', 'prod_1', {
        sku: 'RLM-6205-30', attributeValues: [{ attributeDefinitionId: 'attr_diameter', value: '30' }],
      } as any);

      expect(prisma.productVariant.create).toHaveBeenCalledTimes(2);
    });

    it('rejects archiving a variant that does not belong to the given product', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1', companyId: 'company_A' });
      prisma.productVariant.findFirst.mockResolvedValue(null); // wrong product/variant pairing
      await expect(service.archiveVariant('company_A', 'prod_1', 'var_from_other_product')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists only variants belonging to the given (tenant-scoped) product', async () => {
      prisma.product.findFirst.mockResolvedValue({ id: 'prod_1', companyId: 'company_A' });
      prisma.productVariant.findMany.mockResolvedValue([]);
      await service.listVariants('company_A', 'prod_1');
      expect(prisma.productVariant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId: 'prod_1' } }),
      );
    });
  });

  describe('Smart Search — includes variant SKUs (PHASE 9 + PHASE 11)', () => {
    it('OR-matches a token against variant SKUs and variant attribute values too', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      await service.search('company_A', 'RLM-6205-25');
      const call = prisma.product.findMany.mock.calls[0][0];
      const tokenOr = call.where.AND[0].OR;
      expect(tokenOr.some((c: any) => c.variants?.some?.sku?.contains === 'rlm-6205-25')).toBe(true);
      expect(tokenOr.some((c: any) => c.variants?.some?.attributeValues?.some?.value?.contains === 'rlm-6205-25')).toBe(true);
    });
  });

  describe('createBrand()', () => {
    it('rejects a duplicate brand name within the same company', async () => {
      prisma.brand.findUnique.mockResolvedValue({ id: 'existing_brand' });
      await expect(service.createBrand('company_A', { name: 'SKF' })).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
