import { Module } from '@nestjs/common';
import { DatabaseOracleService } from './database-oracle.service';
import { DatabaseOracleController } from './database-oracle.controller';
import { OracleDocsController } from './oracle-docs.controller';
import { OracleSchemaDocsService } from './oracle-schema-docs.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [UserModule],
  controllers: [OracleDocsController, DatabaseOracleController],
  providers: [DatabaseOracleService, OracleSchemaDocsService],
  exports: [DatabaseOracleService],
})
export class DatabaseOracleModule {}
