import { Module } from '@nestjs/common';

import { LoadController } from './load.controller';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';

import { DatabaseModule } from 'src/database/database.module';

import { LoadGateway } from './load.gateway';
import { TelegramModule } from 'src/telegram/telegram.module';
import { LoadService } from './load.service';

@Module({
  controllers: [LoadController],
  imports: [AuthModule, UserModule, DatabaseModule, TelegramModule],
  providers: [LoadService, LoadGateway],
  exports: [LoadGateway],
})
export class LoadModule {}
