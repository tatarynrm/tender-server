import { Module } from '@nestjs/common';
import { AdminCompanyService } from './admin-company.service';
import { AdminCompanyController } from './admin-company.controller';
import { UserService } from 'src/user/user.service';
import { RedisModule } from 'src/libs/common/redis/redis.module';

@Module({
  imports:[RedisModule],
  controllers: [AdminCompanyController],
  providers: [AdminCompanyService,UserService],
})
export class AdminCompanyModule {}
