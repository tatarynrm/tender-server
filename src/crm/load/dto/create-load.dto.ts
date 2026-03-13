import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';

export class CrmLoadRouteDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  id?: number;

  @ApiPropertyOptional({ example: 50.4503596 })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 30.5245025 })
  @IsOptional()
  @IsNumber()
  lon?: number;

  @ApiProperty({ example: 'Київ' })
  @IsString()
  address: string;

  @ApiProperty({ enum: ['LOAD_FROM', 'LOAD_TO'], example: 'LOAD_FROM' })
  @IsEnum(['LOAD_FROM', 'LOAD_TO'])
  ids_route_type: 'LOAD_FROM' | 'LOAD_TO';

  @ApiPropertyOptional({ example: 'UA' })
  @IsOptional()
  @IsString()
  ids_country?: string;

  @ApiPropertyOptional({ example: 'Київ' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  order_num: number;

  @ApiPropertyOptional({ example: 'REGION_ID' })
  @IsOptional()
  @IsString()
  ids_region?: string;

  @ApiPropertyOptional({ example: 'Хрещатик' })
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  house?: string;

  @ApiPropertyOptional({ example: '01001' })
  @IsOptional()
  @IsString()
  post_code?: string;
}

export class CrmLoadTrailerDto {
  @ApiProperty({ example: 'TENT' })
  @IsString()
  ids_trailer_type: string;
}

export class CreateLoadDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  id?: number;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsNumber()
  @Max(99999999.99)
  price?: number;

  @ApiPropertyOptional({ example: 'UAH' })
  @IsOptional()
  @IsString()
  ids_valut?: string;

  @ApiPropertyOptional({ example: 185 })
  @IsOptional()
  @IsNumber()
  id_client?: number;

  @ApiPropertyOptional({ example: 'Вантаж: Обладнання. Вага: 20т.' })
  @IsOptional()
  @IsString()
  load_info?: string;

  @ApiProperty({ type: [CrmLoadRouteDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrmLoadRouteDto)
  crm_load_route_from: CrmLoadRouteDto[];

  @ApiProperty({ type: [CrmLoadRouteDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrmLoadRouteDto)
  crm_load_route_to: CrmLoadRouteDto[];

  @ApiProperty({ type: [CrmLoadTrailerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CrmLoadTrailerDto)
  crm_load_trailer: CrmLoadTrailerDto[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_price_request?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_collective?: boolean;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  @Max(100)
  car_count_begin: number;

  @ApiProperty({ example: '2026-03-14' })
  @IsString()
  date_load: string;

  @ApiPropertyOptional({ example: '2026-03-14' })
  @IsOptional()
  @IsString()
  date_load2?: string;

  @ApiPropertyOptional({ example: '2026-03-15' })
  @IsOptional()
  @IsString()
  date_unload?: string;
}
