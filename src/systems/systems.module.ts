import { Module } from '@nestjs/common';
import { SystemsService } from './systems.service';
import { SystemsController } from './systems.controller';
import { SystemGateway } from './systems.gateway';
import { AdminSystemController } from './admin-system.controller';
import { TelegramModule } from '../telegram/telegram.module';
import { UserModule } from 'src/user/user.module';

@Module({
  // UserModule — щоб AuthGuard міг отримати UserService для перевірки сесії/ролі.
  imports: [TelegramModule, UserModule],
  controllers: [SystemsController, AdminSystemController],
  providers: [SystemsService, SystemGateway],
  exports: [SystemGateway],
})
export class SystemsModule {}
