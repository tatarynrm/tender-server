import { Global, Module } from '@nestjs/common';
import { SocketSessionService } from './socket-session.service';

/**
 * Глобальний модуль: `SocketSessionService` доступний усім гейтвеям без
 * імпорту (REDIS_CLIENT і ConfigModule також глобальні).
 */
@Global()
@Module({
  providers: [SocketSessionService],
  exports: [SocketSessionService],
})
export class SocketSessionModule {}
