import { Controller } from '@nestjs/common';
import { OracleDatabaseService } from './oracle-database.service';

@Controller('oracle-database')
export class OracleDatabaseController {
  constructor(private readonly oracleDatabaseService: OracleDatabaseService) {}
}
