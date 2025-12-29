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
// import { RedisModule } from './libs/common/redis/redis.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { APP_GUARD } from '@nestjs/core';
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
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';
import { ChatModule } from './chat/chat.module';
import { LoadGateway } from './crm/load/load.gateway';
import { ScheduleModule } from '@nestjs/schedule';
import { CurrencyModule } from './currency/currency.module';
import { FormDataModule } from './tender/form-data/form-data.module';
import { TenderModule } from './tender/tender.module';
import { TransportModule } from './transport/transport.module';
import { LocationModule } from './location/location.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: !IS_DEV_ENV,
      isGlobal: true,
    }),
    // ThrottlerModule.forRoot({
    //   throttlers: [{ limit: 4, ttl: 10 }],
    //   errorMessage: 'Почекайте 10 секунд.Занадто багато спроб',
    // }),
    // TelegrafModule.forRoot({
    //   middlewares: [session()],
    //   token: process.env.TELEGRAM_BOT_TOKEN!,
    // }),
    ScheduleModule.forRoot(),
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
    AdminModule,

    TelegramTokenModule,

    TelegramModule,

    ChatModule,

    CurrencyModule,

    FormDataModule,

    TenderModule,

    TransportModule,

    LocationModule,
  ],
  controllers: [],
  providers: [
    DatabaseModule,
    // {
    //   provide: APP_GUARD,
    //   useClass: ThrottlerGuard,
    // },
    UserGateway,
    TelegramUpdate,
    LoadGateway,
  ],
  exports: [DatabaseModule],
})
export class AppModule {}
