import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseOrderItemInput {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string; // orders a specific SKU of the product (PHASE 9)

  @IsInt()
  @Min(1)
  quantityOrdered!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId!: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemInput)
  items!: PurchaseOrderItemInput[];
}

export class ReceiveLineInput {
  @IsString()
  itemId!: string; // PurchaseOrderItem id

  @IsInt()
  @Min(1)
  quantity!: number; // quantity received in this receipt (supports partial receipts)
}

export class ReceivePurchaseOrderDto {
  @IsString()
  warehouseId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineInput)
  lines!: ReceiveLineInput[];
}
