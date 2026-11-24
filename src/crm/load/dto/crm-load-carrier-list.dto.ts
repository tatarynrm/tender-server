// crm-load-carrier-list.dto.ts
// Параметри екрана заявок перевізника (crm_load_list_per).
// Глобальний ValidationPipe стоїть із forbidNonWhitelisted, тож кожен
// query-параметр, який шле фронт, має бути оголошений тут.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CrmLoadCarrierListDto {
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

  // M — міжнародні, E — експорт, I — імпорт, T — транзит, R — локальні
  @ApiPropertyOptional({ enum: ['M', 'E', 'I', 'T', 'R'] })
  @IsOptional()
  @IsIn(['M', 'E', 'I', 'T', 'R'])
  transit?: string;

  // ── Швидкі фільтри crm_load_list_per ──────────────────────────────────────

  @ApiPropertyOptional({ description: 'Кількість днів пошуку від зараз', example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  @Type(() => Number)
  s_day?: number;

  @ApiPropertyOptional({ description: 'Номер заявки', example: 3611 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  s_crm_load_number?: number;

  @ApiPropertyOptional({ description: 'Прізвище менеджера ICT' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  s_manager?: string;

  @ApiPropertyOptional({ description: 'Звідки: країна, область, місто' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  s_from?: string;

  @ApiPropertyOptional({ description: 'Куди: країна, область, місто' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  s_to?: string;
}
