import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, ValidateNested, IsIn, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBrandDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}

export class CreateAttributeDefinitionDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsIn(['STRING', 'NUMBER', 'ENUM'])
  type?: 'STRING' | 'NUMBER' | 'ENUM';

  @IsOptional()
  @IsString()
  unit?: string;
}

export class AttributeValueInput {
  @IsString()
  attributeDefinitionId!: string;

  @IsString()
  value!: string;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  internalRef!: string;

  @IsOptional()
  @IsString()
  supplierRef?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  shortName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsString()
  countryOfOrigin?: string;

  @IsOptional()
  @IsString()
  hsCode?: string;

  @IsOptional()
  @IsNumber()
  minStock?: number;

  @IsOptional()
  @IsNumber()
  reorderPoint?: number;

  @IsOptional()
  @IsNumber()
  safetyStock?: number;

  @IsOptional()
  @IsNumber()
  sellingPrice?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueInput)
  attributeValues?: AttributeValueInput[];
}

export class UpdateProductDto extends CreateProductDto {}

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsNumber()
  sellingPrice?: number;

  @IsOptional()
  @IsNumber()
  purchaseCost?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttributeValueInput)
  attributeValues?: AttributeValueInput[];
}
