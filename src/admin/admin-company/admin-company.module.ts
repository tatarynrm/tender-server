import { Module } from '@nestjs/common';
import { AdminCompanyService } from './admin-company.service';
import { AdminCompanyController } from './admin-company.controller';
import { UserModule } from 'src/user/user.module';
import { RedisModule } from 'src/libs/common/redis/redis.module';
import { DatabaseOracleModule } from 'src/database-oracle/database-oracle.module';

@Module({
  imports: [RedisModule, UserModule, DatabaseOracleModule],
  controllers: [AdminCompanyController],
  providers: [AdminCompanyService],
})
export class AdminCompanyModule {}
