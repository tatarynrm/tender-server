import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { BullModule } from '@nestjs/bullmq';

import { AdminCompanyModule } from './admin/admin-company/admin-company.module';
import { SocketModule } from './socket/socket.module';
import { SystemsModule } from './systems/systems.module';
import { DatabaseMonitorService } from './database/database-monitor.service';
import { AdminUserModule } from './admin/admin-user/admin-user.module';
import { DownloadModule } from './download/download.module';
import { CronTasksModule } from './crons-tasks/crons-tasks.module';
import { SuggestionModule } from './suggestion/suggestion.module';
import { AiModule } from './ai/ai.module';
import { LogisticsModule } from './ai/logistics/logistics.module';
import { DatabaseOracleModule } from './database-oracle/database-oracle.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      ignoreEnvFile: !IS_DEV_ENV,
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          username: config.get<string>('REDIS_USER'),
          password: config.get<string>('REDIS_PASSWORD'),
        },
      }),
    }),
    MulterModule.registerAsync({
      useClass: MulterConfigService,
    }),
    HealthModule,
    AdminModule,
    AuthModule,
    UserModule,
    ProviderModule,
    MailModule,
    EmailConfirmationModule,
    PasswordRecoveryModule,
    TwoFactorAuthModule,
    DatabaseModule,
    CompanyModule,
    CrmModule,
    ExternalServicesModule,
    NominatimModule,
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
          { path: 'company', module: AdminCompanyModule },
          { path: 'user', module: AdminUserModule },
        ],
      },
    ]),
    SocketModule,
    SystemsModule,
    DownloadModule,
    CronTasksModule,
    SuggestionModule,
    AiModule,
    LogisticsModule,
    DatabaseOracleModule,
  ],
  controllers: [],
  providers: [
    UserGateway,
    TelegramUpdate,
    LoadGateway,
    FileCleanupService,
    DatabaseMonitorService,
  ],
  exports: [DatabaseModule],
})
export class AppModule { }
