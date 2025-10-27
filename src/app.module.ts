import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IS_DEV_ENV } from './libs/common/utils/is-dev.util';
// import { PrismaModule } fro./dqswqewqeqweweq/prisma.moduleule';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ProviderModule } from './auth/provider/provider.module';
import { MailModule } from './libs/common/mail/mail.module';
import { EmailConfirmationModule } from './auth/email-confirmation/email-confirmation.module';
import { PasswordRecoveryModule } from './auth/password-recovery/password-recovery.module';
import { TwoFactorAuthModule } from './auth/two-factor-auth/two-factor-auth.module';
import { RedisModule } from './libs/common/redis/redis.module';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { APP_GUARD } from '@nestjs/core';
import { CompanyModule } from './company/company.module';

import { OraIctModule } from './ora-ict/ora-ict.module';
import { CrmModule } from './crm/crm.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: !IS_DEV_ENV,
      isGlobal: true,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 4, ttl: 10 }],
      errorMessage: 'Почекайте 10 секунд.Занадто багато спроб',
    }),
    
    AuthModule,
    UserModule,
    RedisModule,
    ProviderModule,

    MailModule,

    EmailConfirmationModule,

    PasswordRecoveryModule,

    TwoFactorAuthModule,

    DatabaseModule,

    CompanyModule,

    OraIctModule,

    CrmModule,
  ],
  controllers: [],
  providers: [
    DatabaseModule,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [DatabaseModule],
})
export class AppModule {}
