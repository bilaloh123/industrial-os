import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';
import { StockModule } from '../stock/stock.module';
import { FinanceModule } from '../finance/finance.module';

@Module({
  imports: [AuthModule, StockModule, FinanceModule],
  controllers: [SalesController],
  providers: [SalesService, PrismaService],
  exports: [SalesService],
})
export class SalesModule {}
