import { Module } from '@nestjs/common';
import { OracleDatabaseService } from './oracle-database.service';
import { OracleDatabaseController } from './oracle-database.controller';

@Module({
  controllers: [OracleDatabaseController],
  providers: [OracleDatabaseService],
})
export class OracleDatabaseModule {}
