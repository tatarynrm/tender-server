import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UserModule } from 'src/user/user.module';
import { MailModule } from 'src/libs/common/mail/mail.module';
import { AdminCompanyModule } from './admin-company/admin-company.module';
import { AdminUserModule } from './admin-user/admin-user.module';
import { LoadModule } from 'src/crm/load/load.module';
import { TelegramModule } from 'src/telegram/telegram.module';

@Module({
  imports: [
    UserModule,
    MailModule,
    AdminCompanyModule,
    AdminUserModule,
    LoadModule,
    TelegramModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
