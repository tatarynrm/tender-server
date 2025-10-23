import { Controller } from '@nestjs/common';
import { OraIctService } from './ora-ict.service';

@Controller('ora-ict')
export class OraIctController {
  constructor(private readonly oraIctService: OraIctService) {}
}
