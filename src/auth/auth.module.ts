import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserService } from 'src/user/user.service';
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ProviderModule } from './provider/provider.module';
import { getProvidersConfig } from 'src/config/providers.config';
import { EmailConfirmationModule } from './email-confirmation/email-confirmation.module';
import { MailService } from 'src/libs/common/mail/mail.service';
import { TwoFactorAuthService } from './two-factor-auth/two-factor-auth.service';
import { ProviderService } from './provider/provider.service';
import { CompanyService } from 'src/company/company.service';
import { EmailConfirmationService } from './email-confirmation/email-confirmation.service';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [
    forwardRef(() => EmailConfirmationModule),
    DatabaseModule,
    ProviderModule.registerAsync({
      imports: [ConfigModule],
      useFactory: getProvidersConfig,
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserService,
    MailService,
    TwoFactorAuthService,
    CompanyService,
    EmailConfirmationService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
