import { Module } from '@nestjs/common';
import { AdminUserService } from './admin-user.service';
import { AdminUserController } from './admin-user.controller';
import { UserModule } from 'src/user/user.module';
import { MailModule } from 'src/libs/common/mail/mail.module';

@Module({
  imports: [UserModule, MailModule],
  controllers: [AdminUserController],
  providers: [AdminUserService],
})
export class AdminUserModule {}
