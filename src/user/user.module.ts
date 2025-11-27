import { forwardRef, Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';

import { AuthModule } from 'src/auth/auth.module';
import { MailService } from 'src/libs/common/mail/mail.service';
import { MailModule } from 'src/libs/common/mail/mail.module';


@Module({
  imports: [forwardRef(() => AuthModule),MailModule],
  controllers: [UserController],
  providers: [UserService,MailService],
  exports: [UserService,],
})
export class UserModule {}
