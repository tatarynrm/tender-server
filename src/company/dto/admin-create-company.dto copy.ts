import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class AdminCreateCompanyDto {
  @IsString()
  @IsNotEmpty({ message: 'Назва компанії — обов’язкове поле' })
  company_name: string;

  @IsString()
  @IsOptional()
  company_name_full?: string;

  @IsString({ message: 'Заповніть ІПН або ЄРДПОУ' })
  @IsNotEmpty({ message: 'ЄДРПОУ — обов’язкове поле' })
  edrpou: string;

  @IsString({ message: 'Заповніть адресу' })
  @IsNotEmpty({ message: 'Адреса — обов’язкове поле' })
  address: string;

  @IsString()
  @IsOptional()
  company_form?: string;

  @IsString()
  @IsOptional()
  lei?: string;

  @IsUrl({}, { message: 'Некоректна адреса сайту' })
  @IsOptional()
  web_site?: string;

  @IsBoolean()
  @IsOptional()
  is_client?: boolean;

  @IsBoolean()
  @IsOptional()
  is_carrier?: boolean;

  @IsBoolean()
  @IsOptional()
  is_expedition?: boolean;

  @IsBoolean()
  @IsOptional()
  use_medok?: boolean;

  @IsBoolean()
  @IsOptional()
  use_vchasno?: boolean;

  @IsNumber()
  @IsOptional()
  id_country?: number;
}
