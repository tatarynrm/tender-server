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

@Module({
  imports: [
    forwardRef(() => EmailConfirmationModule),
    ProviderModule.registerAsync({
      imports: [ConfigModule],
      useFactory: getProvidersConfig,
      inject: [ConfigService],
    }),

  ],
  controllers: [AuthController],
  providers: [AuthService, UserService, MailService, TwoFactorAuthService,CompanyService],
  exports: [AuthService],
})
export class AuthModule {}
