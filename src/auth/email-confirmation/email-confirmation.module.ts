import { forwardRef, Module } from '@nestjs/common';
import { EmailConfirmationService } from './email-confirmation.service';
import { EmailConfirmationController } from './email-confirmation.controller';

import { AuthModule } from '../auth.module';
import { MailModule } from 'src/libs/common/mail/mail.module';

import { UserModule } from 'src/user/user.module';
import { databaseProviders } from 'src/database/database.provider';
import { AuthService } from '../auth.service';
import { MailService } from 'src/libs/common/mail/mail.service';
import { UserService } from 'src/user/user.service';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [
    MailModule,
    UserModule,
    forwardRef(() => AuthModule),
    DatabaseModule,
  ],
  controllers: [EmailConfirmationController],
  providers: [EmailConfirmationService],
  exports: [EmailConfirmationService],
})
export class EmailConfirmationModule {}
