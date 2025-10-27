import { PartialType } from '@nestjs/mapped-types';
import { CreateLoadDto } from './create-load.dto';

export class UpdateLoadDto extends PartialType(CreateLoadDto) {}
