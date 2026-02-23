import { Module } from '@nestjs/common';
import { AdminUserService } from './admin-user.service';
import { AdminUserController } from './admin-user.controller';
import { UserService } from 'src/user/user.service';

@Module({
  controllers: [AdminUserController],
  providers: [AdminUserService,UserService],
})
export class AdminUserModule {}
