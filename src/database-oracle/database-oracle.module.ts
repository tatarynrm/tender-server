import { Module } from '@nestjs/common';
import { DatabaseOracleService } from './database-oracle.service';
import { DatabaseOracleController } from './database-oracle.controller';

@Module({
  controllers: [DatabaseOracleController],
  providers: [DatabaseOracleService],
  exports: [DatabaseOracleService],
})
export class DatabaseOracleModule {}
