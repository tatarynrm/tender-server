import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

export class AdminCreateUserDto {
  @ApiProperty({ example: 123, description: 'ID користувача' })
  @IsNumber()
  id_usr: number;

  @ApiPropertyOptional({ example: false, description: 'Фільтр Noris' })
  @IsOptional()
  @IsBoolean()
  noris: boolean;
}