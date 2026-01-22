import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  MinLength,
} from 'class-validator';

export class AdminCreateUserDto {
  @ApiProperty({ example: 'user@example.com', description: 'Електронна пошта' })
  @IsEmail({}, { message: 'Невірний формат пошти' })
  @MinLength(5)
  email: string;

  @ApiProperty({ example: 'Шевченко', description: 'Прізвище' })
  @IsString()
  last_name: string;

  @ApiProperty({ example: 'Тарас', description: "Ім'я" })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Григорович', description: 'По батькові' })
  @IsString()
  surname: string;

  @ApiProperty({
    example: 1,
    description: 'ID компанії, до якої прив’язаний користувач',
  })
  @IsNumber()
  id_company: number;

  @ApiPropertyOptional({
    default: false,
    description: 'Чи заблокований користувач',
  })
  @IsOptional()
  @IsBoolean()
  is_blocked?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Чи увімкнена 2FA' })
  @IsOptional()
  @IsBoolean()
  two_factor_enabled?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Роль: Адміністратор' })
  @IsOptional()
  @IsBoolean()
  is_admin?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Роль: Бухгалтер' })
  @IsOptional()
  @IsBoolean()
  is_accountant?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Роль: Менеджер' })
  @IsOptional()
  @IsBoolean()
  is_manager?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Роль: Директор' })
  @IsOptional()
  @IsBoolean()
  is_director?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Роль: ІТ-адмін (ICT)' })
  @IsOptional()
  @IsBoolean()
  is_ict?: boolean;
}