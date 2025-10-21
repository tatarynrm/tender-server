import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  company_name: string;

  @IsString()
  @IsOptional()
  company_name_full: string;

  @IsString()
  @IsNotEmpty()
  edrpou: string;

  @IsString()
  @IsNotEmpty()
  company_form: string;

  @IsNumber()
  @IsNotEmpty()
  id_country: number;

  @IsBoolean()
  is_carrier: boolean;

  @IsBoolean()
  is_client: boolean;

  @IsBoolean()
  is_expedition: boolean;
}
