import { Module } from '@nestjs/common';
import { AdminCompanyService } from './admin-company.service';
import { AdminCompanyController } from './admin-company.controller';
import { UserModule } from 'src/user/user.module';
import { RedisModule } from 'src/libs/common/redis/redis.module';

@Module({
  imports: [RedisModule, UserModule],
  controllers: [AdminCompanyController],
  providers: [AdminCompanyService],
})
export class AdminCompanyModule {}
