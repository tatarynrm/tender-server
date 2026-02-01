import { Module } from '@nestjs/common';
import { LoadService } from './load.service';
import { LoadController } from './load.controller';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';
import { AuthService } from 'src/auth/auth.service';
import { UserService } from 'src/user/user.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { DatabaseService } from 'src/database/database.service';
import { DatabaseModule } from 'src/database/database.module';

import { LoadGateway } from './load.gateway';
import { TelegramModule } from 'src/telegram/telegram.module';
import { TelegramService } from 'src/telegram/telegram.service';
import { TelegramGateway } from 'src/telegram/telegram.gateway';

@Module({
  imports: [AuthModule, UserModule, DatabaseModule, TelegramModule],
  controllers: [LoadController],
  providers: [LoadService, AuthGuard, DatabaseService, LoadGateway],

  exports: [LoadGateway],
})
export class LoadModule {}
