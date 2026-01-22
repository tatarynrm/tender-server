// crm-load-list.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
} from 'class-validator';
import { IsBooleanQuery } from 'src/libs/common/decorators/is-boolean-query.decorator';

export class CrmLoadListDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit: number = 10;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country_from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region_from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city_from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trailer_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manager?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transit?: string;

  // ОБРОБКА БУЛЕВИХ ЗНАЧЕНЬ З URL (рядок -> boolean)
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @IsBooleanQuery()
  is_price_request?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === '1' || value === true)
  is_collective?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanQuery()
  participate?: boolean;

  @ApiPropertyOptional()
  @IsBooleanQuery()
  my?: boolean;
  @ApiPropertyOptional()
  @IsBooleanQuery()
  active?: boolean;
}
