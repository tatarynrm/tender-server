import { Module } from '@nestjs/common';
import { OracleService } from './oracle.service';
import { OracleController } from './oracle.controller';
import { OracleDatabaseModule } from './oracle-database/oracle-database.module';

@Module({
  controllers: [OracleController],
  providers: [OracleService],
  imports: [OracleDatabaseModule],
})
export class OracleModule {}
