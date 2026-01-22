import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IS_DEV_ENV } from './libs/common/utils/is-dev.util';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ProviderModule } from './auth/provider/provider.module';
import { MailModule } from './libs/common/mail/mail.module';
import { EmailConfirmationModule } from './auth/email-confirmation/email-confirmation.module';
import { PasswordRecoveryModule } from './auth/password-recovery/password-recovery.module';
import { TwoFactorAuthModule } from './auth/two-factor-auth/two-factor-auth.module';
import { DatabaseModule } from './database/database.module';
import { RouterModule } from '@nestjs/core';
import { CompanyModule } from './company/company.module';
import { OraIctModule } from './ora-ict/ora-ict.module';
import { CrmModule } from './crm/crm.module';
import { ExternalServicesModule } from './external-services/external-services.module';
import { NominatimModule } from './external-services/nominatim/nominatim.module';
import { UserGateway } from './user/user.gateway';
import { AdminModule } from './admin/admin.module';
import { TelegramModule } from './telegram/telegram.module';
import { TelegramTokenModule } from './telegram/telegram-token/telegram-token.module';
import { TelegramUpdate } from './telegram/telegram.update';
import { ChatModule } from './chat/chat.module';
import { LoadGateway } from './crm/load/load.gateway';
import { ScheduleModule } from '@nestjs/schedule';
import { CurrencyModule } from './currency/currency.module';
import { FormDataModule } from './tender/form-data/form-data.module';
import { TenderModule } from './tender/tender.module';
import { TransportModule } from './transport/transport.module';
import { LocationModule } from './location/location.module';
import { OracleModule } from './oracle/oracle.module';
import { MulterModule } from '@nestjs/platform-express';
import { MulterConfigService } from './config/multer.config.service';
import { CocktailsModule } from './cocktails/cocktails.module';
import { FileCleanupService } from './common/services/file-cleanup.service';
import { ClsModule } from 'nestjs-cls';

import { AdminCompanyModule } from './admin/admin-company/admin-company.module';
import { AdminUserModule } from './admin/admin-user/admin-user.module';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true }, // автоматично підключає middleware для кожного запиту
    }),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      ignoreEnvFile: !IS_DEV_ENV,
      isGlobal: true,
    }),
    MulterModule.registerAsync({
      useClass: MulterConfigService,
    }),

    ScheduleModule.forRoot(),
    AdminModule,

    AuthModule,
    UserModule,
    // RedisModule,
    ProviderModule,

    MailModule,

    EmailConfirmationModule,

    PasswordRecoveryModule,

    TwoFactorAuthModule,

    DatabaseModule,

    CompanyModule,

    OraIctModule,

    CrmModule,

    ExternalServicesModule,
    NominatimModule,
    ExternalServicesModule,

    TelegramTokenModule,

    TelegramModule,

    ChatModule,

    CurrencyModule,

    FormDataModule,

    TenderModule,

    TransportModule,

    LocationModule,

    OracleModule,

    CocktailsModule,
    RouterModule.register([
      {
        path: 'admin',
        module: AdminModule,
        children: [
          {
            path: 'user',
            module: AdminUserModule,
          },
          {
            path: 'company',
            module: AdminCompanyModule,
          },
        ],
      },
    ]),
  ],
  controllers: [],
  providers: [
    DatabaseModule,
    UserGateway,
    TelegramUpdate,
    LoadGateway,
    FileCleanupService,
  ],
  exports: [DatabaseModule],
})
export class AppModule {}
