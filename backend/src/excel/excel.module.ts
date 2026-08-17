import { Module } from '@nestjs/common';
import { ExcelController } from './excel.controller';
import { ExcelService } from './excel.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [AuthModule, StockModule],
  controllers: [ExcelController],
  providers: [ExcelService, PrismaService],
})
export class ExcelModule {}
