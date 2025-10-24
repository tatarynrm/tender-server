import { Module } from '@nestjs/common';
import { TwoFactorAuthService } from './two-factor-auth.service';
import { MailService } from 'src/libs/common/mail/mail.service';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [TwoFactorAuthService, MailService],
})
export class TwoFactorAuthModule {}
