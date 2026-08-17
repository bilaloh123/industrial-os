import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SalesService } from '../sales/sales.service';
import { CreateDeliveryDto, CompleteDeliveryDto } from './dto/delivery.dto';

const DELIVERY_INCLUDE = {
  salesOrder: { include: { customer: true, items: { include: { product: true } } } },
  driver: true,
  warehouse: true,
} as const;

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
  ) {}

  async list(companyId: string) {
    return this.prisma.delivery.findMany({
      where: { companyId },
      include: DELIVERY_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async findOne(companyId: string, id: string) {
    const delivery = await this.prisma.delivery.findFirst({ where: { id, companyId }, include: DELIVERY_INCLUDE });
    if (!delivery) throw new NotFoundException('التوصيل غير موجود');
    return delivery;
  }

  // ---------------------------------------------------------------
  // CREATE — one delivery run per sales order, only once the order is
  // physically ready (PACKED). Mirrors the Invoice/Bill "one real
  // document per source" traceability pattern used everywhere else.
  // ---------------------------------------------------------------
  async create(companyId: string, dto: CreateDeliveryDto) {
    const order = await this.prisma.salesOrder.findFirst({ where: { id: dto.salesOrderId, companyId } });
    if (!order) throw new NotFoundException('طلب البيع غير موجود');
    if (order.status !== 'PACKED') {
      throw new BadRequestException('يجب أن يكون طلب البيع معبأ (PACKED) قبل إنشاء توصيل له');
    }

    const existing = await this.prisma.delivery.findUnique({ where: { salesOrderId: dto.salesOrderId } });
    if (existing) throw new BadRequestException('يوجد توصيل مرتبط بهذا الطلب من قبل');

    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException('المستودع غير موجود');

    return this.prisma.delivery.create({
      data: {
        companyId,
        salesOrderId: dto.salesOrderId,
        warehouseId: dto.warehouseId,
        address: dto.address,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        notes: dto.notes,
        status: 'PENDING',
      },
      include: DELIVERY_INCLUDE,
    });
  }

  // ---------------------------------------------------------------
  // ASSIGN DRIVER — PENDING -> ASSIGNED
  // ---------------------------------------------------------------
  async assignDriver(companyId: string, id: string, driverId: string) {
    const delivery = await this.findOne(companyId, id);
    if (delivery.status !== 'PENDING') {
      throw new BadRequestException('لا يمكن تعيين سائق إلا لتوصيل بحالة PENDING');
    }
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, companyId, isActive: true } });
    if (!driver) throw new NotFoundException('السائق غير موجود أو غير نشط');

    return this.prisma.delivery.update({
      where: { id },
      data: { driverId, status: 'ASSIGNED' },
      include: DELIVERY_INCLUDE,
    });
  }

  // ---------------------------------------------------------------
  // START TRANSIT — ASSIGNED -> IN_TRANSIT, also advances the underlying
  // sales order to DISPATCHED so both stay in sync.
  // ---------------------------------------------------------------
  async startTransit(companyId: string, actorId: string, id: string) {
    const delivery = await this.findOne(companyId, id);
    if (delivery.status !== 'ASSIGNED') {
      throw new BadRequestException('يجب تعيين سائق أولاً قبل بدء الرحلة');
    }

    await this.sales.advance(companyId, actorId, delivery.salesOrderId, 'DISPATCHED');

    return this.prisma.delivery.update({
      where: { id },
      data: { status: 'IN_TRANSIT' },
      include: DELIVERY_INCLUDE,
    });
  }

  // ---------------------------------------------------------------
  // COMPLETE — IN_TRANSIT -> DELIVERED. This is the moment the goods
  // actually leave the warehouse: it calls the REAL SalesService.deliver()
  // (same stock ledger + insufficient-stock guard everything else uses),
  // so a "delivered" run always corresponds to a real stock-out movement.
  // ---------------------------------------------------------------
  async complete(
    companyId: string,
    actorId: string,
    actorPermissions: string[],
    isSuperAdmin: boolean,
    id: string,
    dto: CompleteDeliveryDto,
  ) {
    const delivery = await this.findOne(companyId, id);
    if (delivery.status !== 'IN_TRANSIT') {
      throw new BadRequestException('يجب أن يكون التوصيل قيد النقل (IN_TRANSIT) قبل تأكيد التسليم');
    }

    await this.sales.deliver(companyId, actorId, actorPermissions, isSuperAdmin, delivery.salesOrderId, delivery.warehouseId);

    return this.prisma.delivery.update({
      where: { id },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        recipientName: dto.recipientName,
        notes: dto.notes ?? delivery.notes,
      },
      include: DELIVERY_INCLUDE,
    });
  }

  // ---------------------------------------------------------------
  // FAIL — the delivery attempt did not succeed (customer absent,
  // refused, wrong address...). Stock and the sales order are left
  // untouched — a new delivery run (or manual handling) picks up from
  // wherever the order's status already is.
  // ---------------------------------------------------------------
  async fail(companyId: string, id: string, reason: string) {
    const delivery = await this.findOne(companyId, id);
    if (!['ASSIGNED', 'IN_TRANSIT'].includes(delivery.status)) {
      throw new BadRequestException('لا يمكن تسجيل فشل إلا لتوصيل قيد التنفيذ');
    }
    return this.prisma.delivery.update({
      where: { id },
      data: { status: 'FAILED', failureReason: reason },
      include: DELIVERY_INCLUDE,
    });
  }
}
