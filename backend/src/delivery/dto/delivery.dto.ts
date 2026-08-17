import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  vehicleInfo?: string;
}

export class CreateDeliveryDto {
  @IsString()
  salesOrderId!: string;

  @IsString()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AssignDriverDto {
  @IsString()
  driverId!: string;
}

export class CompleteDeliveryDto {
  @IsString()
  recipientName!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class FailDeliveryDto {
  @IsString()
  reason!: string;
}
