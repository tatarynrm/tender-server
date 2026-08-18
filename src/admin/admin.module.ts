import { Module, forwardRef } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UserModule } from 'src/user/user.module';
import { MailModule } from 'src/libs/common/mail/mail.module';
import { AdminCompanyModule } from './admin-company/admin-company.module';
import { AdminUserModule } from './admin-user/admin-user.module';
import { LoadModule } from 'src/crm/load/load.module';
import { TelegramModule } from 'src/telegram/telegram.module';
import { MailingService } from './mailing.service';
import { BullModule } from '@nestjs/bullmq';
import { MailingProcessor } from './processors/mailing.processor';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { multerFileFilter, MULTER_LIMITS } from '../config/multer-file-filter';

@Module({
  imports: [
    UserModule,
    MailModule,
    AdminCompanyModule,
    AdminUserModule,
    LoadModule,
    TelegramModule,
    // Аплоади розсилок (Excel-адреси, вкладення) — з фільтром типів і лімітом.
    MulterModule.register({
      storage: memoryStorage(),
      limits: MULTER_LIMITS,
      fileFilter: multerFileFilter,
    }),
    BullModule.registerQueue({
      name: 'email-mailing',
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, MailingService, MailingProcessor],
  exports: [AdminService, MailingService],
})
export class AdminModule {}
