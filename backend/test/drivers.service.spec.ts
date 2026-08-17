import { NotFoundException } from '@nestjs/common';
import { DriversService } from '../src/delivery/drivers.service';
import { PrismaService } from '../src/prisma.service';

describe('DriversService', () => {
  let service: DriversService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      driver: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    service = new DriversService(prisma as unknown as PrismaService);
  });

  it('lists drivers scoped to the caller company', async () => {
    prisma.driver.findMany.mockResolvedValue([]);
    await service.list('company_A');
    expect(prisma.driver.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'company_A' } }),
    );
  });

  it('creates a driver tied to the caller company', async () => {
    prisma.driver.create.mockResolvedValue({ id: 'driver_1' });
    await service.create('company_A', { name: 'Youssef', phone: '0600000000' } as any);
    expect(prisma.driver.create).toHaveBeenCalledWith({
      data: { companyId: 'company_A', name: 'Youssef', phone: '0600000000' },
    });
  });

  it('rejects deactivating a driver belonging to a different company (tenant isolation)', async () => {
    prisma.driver.findFirst.mockResolvedValue(null);
    await expect(service.setActive('company_A', 'driver_from_company_B', false)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.driver.update).not.toHaveBeenCalled();
  });

  it('deactivates a driver belonging to the caller company', async () => {
    prisma.driver.findFirst.mockResolvedValue({ id: 'driver_1', companyId: 'company_A' });
    prisma.driver.update.mockResolvedValue({ id: 'driver_1', isActive: false });
    const result = await service.setActive('company_A', 'driver_1', false);
    expect(result.isActive).toBe(false);
  });
});
