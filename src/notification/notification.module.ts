import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { UserService } from 'src/user/user.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, UserService],
})
export class NotificationModule {}
