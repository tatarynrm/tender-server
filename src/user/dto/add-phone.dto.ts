import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class AddPhoneDto {
  @IsString()
  @IsNotEmpty({ message: 'Номер телефону обовʼязковий' })
  @Matches(/^\+?\d{7,15}$/, { message: 'Некоректний номер телефону' })
  phone: string;

  @IsOptional()
  @IsBoolean()
  is_telegram?: boolean;

  @IsOptional()
  @IsBoolean()
  is_viber?: boolean;

  @IsOptional()
  @IsBoolean()
  is_whatsapp?: boolean;
}
