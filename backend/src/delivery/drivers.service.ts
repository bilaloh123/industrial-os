import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateDriverDto } from './dto/delivery.dto';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.driver.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
  }

  async findOne(companyId: string, id: string) {
    const driver = await this.prisma.driver.findFirst({ where: { id, companyId } });
    if (!driver) throw new NotFoundException('السائق غير موجود');
    return driver;
  }

  create(companyId: string, dto: CreateDriverDto) {
    return this.prisma.driver.create({ data: { companyId, ...dto } });
  }

  async setActive(companyId: string, id: string, isActive: boolean) {
    await this.findOne(companyId, id);
    return this.prisma.driver.update({ where: { id }, data: { isActive } });
  }
}
