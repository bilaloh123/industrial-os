import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { ProductsModule } from './products/products.module';
import { StockModule } from './stock/stock.module';
import { CustomersModule } from './customers/customers.module';
import { SalesModule } from './sales/sales.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { FinanceModule } from './finance/finance.module';
import { ImportsModule } from './imports/imports.module';
import { DocumentsModule } from './documents/documents.module';
import { ExcelModule } from './excel/excel.module';
import { DeliveryModule } from './delivery/delivery.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limiting (PHASE 55 security)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    CompaniesModule,
    UsersModule,
    RolesModule,
    ProductsModule,
    StockModule,
    CustomersModule,
    SalesModule,
    SuppliersModule,
    PurchasesModule,
    FinanceModule,
    ImportsModule,
    DocumentsModule,
    ExcelModule,
    DeliveryModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
