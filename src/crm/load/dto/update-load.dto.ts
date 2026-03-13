import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateLoadDto } from './create-load.dto';
import { IsNumber } from 'class-validator';

export class UpdateLoadDto extends PartialType(CreateLoadDto) {
  @ApiProperty({ example: 1 })
  @IsNumber()
  id: number;
}
