import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [AuthModule, SalesModule],
  controllers: [DriversController, DeliveryController],
  providers: [DriversService, DeliveryService, PrismaService],
})
export class DeliveryModule {}
