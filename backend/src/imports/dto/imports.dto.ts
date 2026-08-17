import { IsString, IsOptional, IsNumber, Min, IsIn } from 'class-validator';

const EXPENSE_TYPES = [
  'FREIGHT', 'INSURANCE', 'CUSTOMS', 'TRANSIT', 'PORT_FEES',
  'HANDLING', 'BANK_FEES', 'DOCUMENTATION', 'STORAGE', 'OTHER',
] as const;

export class CreateImportDto {
  @IsString()
  purchaseOrderId!: string;

  @IsOptional() @IsString() countryOfOrigin?: string;
  @IsOptional() @IsString() portOfDeparture?: string;
  @IsOptional() @IsString() portOfArrival?: string;
  @IsOptional() @IsString() carrier?: string;
  @IsOptional() @IsString() incoterm?: string;
}

export class AddImportExpenseDto {
  @IsIn(EXPENSE_TYPES)
  type!: (typeof EXPENSE_TYPES)[number];

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
