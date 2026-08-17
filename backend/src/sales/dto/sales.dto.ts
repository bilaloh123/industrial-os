import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SalesOrderItemInput {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string; // sells a specific SKU of the product (PHASE 9)

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  discountPercent?: number;
}

export class CreateSalesOrderDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemInput)
  items!: SalesOrderItemInput[];

  // Required only when at least one item sells below the product's
  // minimum acceptable margin (PHASE 26 — Minimum Margin Protection).
  @IsOptional()
  @IsString()
  marginOverrideReason?: string;
}

export class DeliverOrderDto {
  @IsString()
  warehouseId!: string;
}
