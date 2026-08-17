import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  // Every read is scoped to the caller's own tenant — never accept a
  // companyId from the client; always derive it from the JWT (req.user).
  async getMyCompany(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  async updateMyCompany(companyId: string, data: Partial<{
    name: string; logoUrl: string; address: string; ice: string; ifNumber: string;
    rc: string; tp: string; phone: string; email: string; website: string;
    defaultCurrency: string;
  }>) {
    return this.prisma.company.update({ where: { id: companyId }, data });
  }

  /** Defensive helper other modules should reuse: throws if a record's
   * companyId doesn't match the caller's tenant. */
  assertSameTenant(recordCompanyId: string, callerCompanyId: string) {
    if (recordCompanyId !== callerCompanyId) {
      throw new ForbiddenException('لا يمكن الوصول إلى بيانات شركة أخرى');
    }
  }
}
