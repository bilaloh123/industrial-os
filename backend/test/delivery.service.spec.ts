import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeliveryService } from '../src/delivery/delivery.service';
import { SalesService } from '../src/sales/sales.service';
import { PrismaService } from '../src/prisma.service';

describe('DeliveryService', () => {
  let service: DeliveryService;
  let prisma: any;
  let sales: any;

  const PACKED_ORDER = { id: 'so_1', companyId: 'company_A', status: 'PACKED' };
  const WAREHOUSE = { id: 'wh_1', companyId: 'company_A' };

  beforeEach(() => {
    prisma = {
      salesOrder: { findFirst: jest.fn() },
      delivery: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      warehouse: { findFirst: jest.fn() },
      driver: { findFirst: jest.fn() },
    };
    sales = { advance: jest.fn().mockResolvedValue({}), deliver: jest.fn().mockResolvedValue({}) };
    service = new DeliveryService(prisma as unknown as PrismaService, sales as unknown as SalesService);
  });

  describe('create() — one delivery per PACKED order', () => {
    it('rejects creating a delivery for an order that is not PACKED yet', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({ ...PACKED_ORDER, status: 'READY' });
      await expect(
        service.create('company_A', { salesOrderId: 'so_1', warehouseId: 'wh_1' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a sales order belonging to a different company', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue(null);
      await expect(
        service.create('company_A', { salesOrderId: 'so_from_company_B', warehouseId: 'wh_1' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects creating a second delivery for the same order', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue(PACKED_ORDER);
      prisma.delivery.findUnique.mockResolvedValue({ id: 'existing_delivery' });
      await expect(
        service.create('company_A', { salesOrderId: 'so_1', warehouseId: 'wh_1' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a PENDING delivery for a valid PACKED order', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue(PACKED_ORDER);
      prisma.delivery.findUnique.mockResolvedValue(null);
      prisma.warehouse.findFirst.mockResolvedValue(WAREHOUSE);
      prisma.delivery.create.mockResolvedValue({ id: 'del_1', status: 'PENDING' });

      const result = await service.create('company_A', { salesOrderId: 'so_1', warehouseId: 'wh_1' } as any);
      expect(result.status).toBe('PENDING');
    });
  });

  describe('assignDriver() — PENDING -> ASSIGNED', () => {
    it('rejects assigning a driver to a delivery that is not PENDING', async () => {
      prisma.delivery.findFirst.mockResolvedValue({ id: 'del_1', companyId: 'company_A', status: 'ASSIGNED' });
      await expect(service.assignDriver('company_A', 'del_1', 'driver_1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an inactive or unknown driver', async () => {
      prisma.delivery.findFirst.mockResolvedValue({ id: 'del_1', companyId: 'company_A', status: 'PENDING' });
      prisma.driver.findFirst.mockResolvedValue(null);
      await expect(service.assignDriver('company_A', 'del_1', 'driver_1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('assigns the driver and transitions to ASSIGNED', async () => {
      prisma.delivery.findFirst.mockResolvedValue({ id: 'del_1', companyId: 'company_A', status: 'PENDING' });
      prisma.driver.findFirst.mockResolvedValue({ id: 'driver_1', isActive: true });
      prisma.delivery.update.mockResolvedValue({ id: 'del_1', status: 'ASSIGNED', driverId: 'driver_1' });

      const result = await service.assignDriver('company_A', 'del_1', 'driver_1');
      expect(result.status).toBe('ASSIGNED');
    });
  });

  describe('startTransit() — ASSIGNED -> IN_TRANSIT, keeps the sales order in sync', () => {
    it('rejects starting transit before a driver is assigned', async () => {
      prisma.delivery.findFirst.mockResolvedValue({ id: 'del_1', companyId: 'company_A', status: 'PENDING' });
      await expect(service.startTransit('company_A', 'user_1', 'del_1')).rejects.toBeInstanceOf(BadRequestException);
      expect(sales.advance).not.toHaveBeenCalled();
    });

    it('advances the underlying sales order to DISPATCHED and the delivery to IN_TRANSIT', async () => {
      prisma.delivery.findFirst.mockResolvedValue({ id: 'del_1', companyId: 'company_A', status: 'ASSIGNED', salesOrderId: 'so_1' });
      prisma.delivery.update.mockResolvedValue({ id: 'del_1', status: 'IN_TRANSIT' });

      const result = await service.startTransit('company_A', 'user_1', 'del_1');
      expect(sales.advance).toHaveBeenCalledWith('company_A', 'user_1', 'so_1', 'DISPATCHED');
      expect(result.status).toBe('IN_TRANSIT');
    });
  });

  describe('complete() — the real stock-moving step', () => {
    it('rejects completing a delivery that is not IN_TRANSIT', async () => {
      prisma.delivery.findFirst.mockResolvedValue({ id: 'del_1', companyId: 'company_A', status: 'ASSIGNED' });
      await expect(
        service.complete('company_A', 'user_1', ['stock.adjust'], false, 'del_1', { recipientName: 'Ahmed' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sales.deliver).not.toHaveBeenCalled();
    });

    it('calls the REAL SalesService.deliver() (same stock ledger everything else uses) with the delivery\'s own warehouse', async () => {
      prisma.delivery.findFirst.mockResolvedValue({
        id: 'del_1', companyId: 'company_A', status: 'IN_TRANSIT', salesOrderId: 'so_1', warehouseId: 'wh_1', notes: null,
      });
      prisma.delivery.update.mockResolvedValue({ id: 'del_1', status: 'DELIVERED' });

      await service.complete('company_A', 'user_1', ['stock.adjust'], false, 'del_1', { recipientName: 'Ahmed Alaoui' } as any);

      expect(sales.deliver).toHaveBeenCalledWith('company_A', 'user_1', ['stock.adjust'], false, 'so_1', 'wh_1');
      const updateCall = prisma.delivery.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('DELIVERED');
      expect(updateCall.data.recipientName).toBe('Ahmed Alaoui');
      expect(updateCall.data.deliveredAt).toBeInstanceOf(Date);
    });

    it('propagates a StockService/SalesService rejection (e.g. insufficient stock) instead of marking DELIVERED', async () => {
      prisma.delivery.findFirst.mockResolvedValue({
        id: 'del_1', companyId: 'company_A', status: 'IN_TRANSIT', salesOrderId: 'so_1', warehouseId: 'wh_1',
      });
      sales.deliver.mockRejectedValue(new BadRequestException('الكمية المطلوبة تفوق المتوفر'));

      await expect(
        service.complete('company_A', 'user_1', ['stock.adjust'], false, 'del_1', { recipientName: 'Ahmed' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.delivery.update).not.toHaveBeenCalled();
    });
  });

  describe('fail() — leaves stock and the sales order untouched', () => {
    it('rejects failing a delivery that has not started (still PENDING)', async () => {
      prisma.delivery.findFirst.mockResolvedValue({ id: 'del_1', companyId: 'company_A', status: 'PENDING' });
      await expect(service.fail('company_A', 'del_1', 'العميل غير متواجد')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marks a failed delivery with the reason, without touching stock', async () => {
      prisma.delivery.findFirst.mockResolvedValue({ id: 'del_1', companyId: 'company_A', status: 'IN_TRANSIT' });
      prisma.delivery.update.mockResolvedValue({ id: 'del_1', status: 'FAILED', failureReason: 'العميل غير متواجد' });

      const result = await service.fail('company_A', 'del_1', 'العميل غير متواجد');
      expect(result.status).toBe('FAILED');
      expect(sales.deliver).not.toHaveBeenCalled();
    });
  });

  describe('tenant isolation', () => {
    it('cannot read a delivery belonging to a different company', async () => {
      prisma.delivery.findFirst.mockResolvedValue(null);
      await expect(service.findOne('company_A', 'delivery_from_company_B')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
