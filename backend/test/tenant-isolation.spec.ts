import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../src/users/users.service';
import { CompaniesService } from '../src/companies/companies.service';
import { PrismaService } from '../src/prisma.service';

/**
 * PHASE 3 — Tenant Isolation tests.
 * Every query in the app is expected to be scoped by companyId derived
 * from the caller's JWT, never from client-supplied input. These tests
 * assert that a user from Company A can never read or modify a record
 * belonging to Company B, even if they know its id.
 */
describe('Tenant isolation', () => {
  describe('UsersService', () => {
    let service: UsersService;
    let prisma: any;

    const USER_IN_COMPANY_B = {
      id: 'user_b_1',
      companyId: 'company_B',
      email: 'someone@companyb.ma',
      deletedAt: null,
    };

    beforeEach(async () => {
      prisma = {
        user: {
          // Simulates a real Prisma `findFirst({ where: { id, companyId, deletedAt: null } })`:
          // returns null if the companyId in the filter doesn't match the record's tenant.
          findFirst: jest.fn(({ where }: any) =>
            where.id === USER_IN_COMPANY_B.id && where.companyId === USER_IN_COMPANY_B.companyId
              ? USER_IN_COMPANY_B
              : null,
          ),
          findMany: jest.fn(),
          update: jest.fn(),
        },
        session: { updateMany: jest.fn() },
        auditLog: { create: jest.fn() },
      };

      const moduleRef = await Test.createTestingModule({
        providers: [UsersService, { provide: PrismaService, useValue: prisma }],
      }).compile();

      service = moduleRef.get(UsersService);
    });

    it('cannot read a user belonging to a different company by guessing their id', async () => {
      await expect(
        service.findOne('company_A' /* attacker's tenant */, USER_IN_COMPANY_B.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('can read a user that genuinely belongs to the caller company', async () => {
      const result = await service.findOne('company_B', USER_IN_COMPANY_B.id);
      expect(result.id).toBe(USER_IN_COMPANY_B.id);
    });

    it('cannot deactivate a user belonging to a different company', async () => {
      await expect(
        service.setActive('company_A', 'attacker_actor', USER_IN_COMPANY_B.id, false),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('cannot soft-delete a user belonging to a different company', async () => {
      await expect(
        service.softDelete('company_A', 'attacker_actor', USER_IN_COMPANY_B.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('list() only ever filters by the caller companyId (never trusts a passed-in tenant)', async () => {
      await service.list('company_B');
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'company_B' }) }),
      );
    });
  });

  describe('CompaniesService.assertSameTenant', () => {
    it('throws ForbiddenException when the record and caller tenants differ', () => {
      const service = new CompaniesService({} as any);
      expect(() => service.assertSameTenant('company_B', 'company_A')).toThrow(ForbiddenException);
    });

    it('passes silently when tenants match', () => {
      const service = new CompaniesService({} as any);
      expect(() => service.assertSameTenant('company_A', 'company_A')).not.toThrow();
    });
  });
});
