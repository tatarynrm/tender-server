import { IsBoolean, IsEmail, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CompanyFillPreRegister {
  @IsNumber()
  @IsNotEmpty()
  id_usr_pre_register: number;
}
