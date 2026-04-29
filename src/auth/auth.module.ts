import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ProviderModule } from './provider/provider.module';
import { getProvidersConfig } from 'src/config/providers.config';
import { EmailConfirmationModule } from './email-confirmation/email-confirmation.module';
import { TwoFactorAuthService } from './two-factor-auth/two-factor-auth.service';
import { EmailConfirmationService } from './email-confirmation/email-confirmation.service';
import { DatabaseModule } from 'src/database/database.module';
import { AuthGuard } from './guards/auth.guard';
import { UserModule } from 'src/user/user.module';
import { MailModule } from 'src/libs/common/mail/mail.module';
import { CompanyModule } from 'src/company/company.module';

@Module({
  imports: [
    forwardRef(() => EmailConfirmationModule),
    forwardRef(() => UserModule),
    MailModule,
    CompanyModule,
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
    TwoFactorAuthService,
    EmailConfirmationService,
    AuthGuard,
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
