import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UserService } from 'src/user/user.service';
import { UserGateway } from 'src/user/user.gateway';

@Module({
  controllers: [AdminController],
  providers: [AdminService,UserService,UserGateway],
  exports: [AdminService],
})
export class AdminModule {}
