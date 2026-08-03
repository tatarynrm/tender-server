import { Module } from '@nestjs/common';
import { ClaudeAgentService } from './claude-agent.service';

/**
 * Запуск автономних задач Claude Code з Telegram.
 * Контролера немає навмисно: єдина точка входу — бот, під адмінським гейтом.
 */
@Module({
  providers: [ClaudeAgentService],
  exports: [ClaudeAgentService],
})
export class ClaudeAgentModule {}
