import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UserService } from 'src/user/user.service';
import { MailService } from 'src/libs/common/mail/mail.service';
import { MailModule } from 'src/libs/common/mail/mail.module';

import { APP_GUARD, RouterModule } from '@nestjs/core';

import { AdminCompanyModule } from './admin-company/admin-company.module';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { AdminUserModule } from './admin-user/admin-user.module';

@Module({
  imports: [MailModule, AdminCompanyModule, AdminUserModule],
  controllers: [AdminController],
  providers: [AdminService, UserService, MailService],
  exports: [AdminService],
})
export class AdminModule {}
