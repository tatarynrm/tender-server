import { forwardRef, Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';

import { AuthModule } from 'src/auth/auth.module';
import { MailService } from 'src/libs/common/mail/mail.service';
import { MailModule } from 'src/libs/common/mail/mail.module';
import { UserGateway } from './user.gateway';


@Module({
  imports: [forwardRef(() => AuthModule),MailModule],
  controllers: [UserController],
  providers: [UserService,MailService,UserGateway],
  exports: [UserService,UserGateway],
})
export class UserModule {}
