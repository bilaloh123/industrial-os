import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.customer.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async findOne(companyId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId } });
    if (!customer) throw new NotFoundException('العميل غير موجود');
    return customer;
  }

  create(companyId: string, data: { name: string; ice?: string; address?: string; phone?: string; email?: string; paymentTerms?: string; creditLimit?: number }) {
    return this.prisma.customer.create({ data: { companyId, ...data } });
  }
}
