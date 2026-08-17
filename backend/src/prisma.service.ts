import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma client. Injected everywhere data access is needed.
 * NOTE: tenant isolation (companyId scoping) is enforced explicitly
 * in every service method — see common/guards/tenant.guard.ts and
 * the pattern used in auth/roles/users services.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
