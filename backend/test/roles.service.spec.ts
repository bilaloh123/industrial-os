import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RolesService } from '../src/roles/roles.service';
import { PrismaService } from '../src/prisma.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      role: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      permission: { findMany: jest.fn() },
      rolePermission: { deleteMany: jest.fn(), createMany: jest.fn() },
      user: { findFirst: jest.fn() },
      userRole: { upsert: jest.fn() },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [RolesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(RolesService);
  });

  it('refuses to modify the permissions of the SUPER_ADMIN system role', async () => {
    prisma.role.findFirst.mockResolvedValue({
      id: 'role_super_admin',
      companyId: 'company_A',
      isSystem: true,
      code: 'SUPER_ADMIN',
    });

    await expect(
      service.setPermissions('company_A', 'role_super_admin', ['finance.view']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws NotFoundException when the role does not belong to the caller company', async () => {
    prisma.role.findFirst.mockResolvedValue(null); // simulates tenant-scoped lookup returning nothing
    await expect(
      service.setPermissions('company_A', 'role_from_other_company', ['products.view']),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replaces (not merges) a custom role permission set', async () => {
    prisma.role.findFirst.mockResolvedValue({
      id: 'role_custom',
      companyId: 'company_A',
      isSystem: false,
      code: 'CUSTOM',
    });
    prisma.permission.findMany.mockResolvedValue([{ id: 'perm_1' }, { id: 'perm_2' }]);
    prisma.role.findUnique.mockResolvedValue({ id: 'role_custom', permissions: [] });

    await service.setPermissions('company_A', 'role_custom', ['products.view', 'stock.view']);

    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'role_custom' } });
    expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'role_custom', permissionId: 'perm_1' }, { roleId: 'role_custom', permissionId: 'perm_2' }],
    });
  });

  it('cannot assign a role to a user from a different company (tenant isolation)', async () => {
    prisma.user.findFirst.mockResolvedValue(null); // user not found under this tenant's filter
    prisma.role.findFirst.mockResolvedValue({ id: 'role_1', companyId: 'company_A' });

    await expect(
      service.assignToUser('company_A', 'user_from_company_B', 'role_1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
