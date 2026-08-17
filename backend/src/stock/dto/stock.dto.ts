import { IsString, IsOptional, IsInt, IsIn, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class CreateZoneDto {
  @IsString() name!: string;
  @IsString() code!: string;
}
export class CreateRackDto {
  @IsString() name!: string;
  @IsString() code!: string;
}
export class CreateShelfDto {
  @IsString() name!: string;
  @IsString() code!: string;
}
export class CreateBinDto {
  @IsString() name!: string;
  @IsString() code!: string;
}

const MOVEMENT_TYPES = [
  'PURCHASE_RECEIPT', 'SALE', 'RETURN_IN', 'RETURN_OUT', 'TRANSFER',
  'ADJUSTMENT', 'DAMAGE', 'LOSS', 'INVENTORY_COUNT', 'INTERNAL_USE',
] as const;

export class RecordMovementDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string; // narrows the movement to a specific ProductVariant SKU

  @IsString()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  binId?: string;

  @IsIn(MOVEMENT_TYPES)
  type!: (typeof MOVEMENT_TYPES)[number];

  @IsInt()
  quantity!: number; // positive = in, negative = out

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  referenceDocument?: string;
}
