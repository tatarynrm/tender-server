// crm-load-carrier-list.dto.ts
// Параметри екрана заявок перевізника (crm_load_per_list).
// Глобальний ValidationPipe стоїть із forbidNonWhitelisted, тож кожен
// query-параметр, який шле фронт, має бути оголошений тут.
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

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
}
