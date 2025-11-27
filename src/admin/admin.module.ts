import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UserService } from 'src/user/user.service';
import { UserGateway } from 'src/user/user.gateway';
import { MailService } from 'src/libs/common/mail/mail.service';
import { MailModule } from 'src/libs/common/mail/mail.module';

@Module({
  imports:[MailModule],
  controllers: [AdminController],
  providers: [AdminService,UserService,MailService],
  exports: [AdminService],
})
export class AdminModule {}
