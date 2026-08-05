import { Module } from '@nestjs/common';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { DatabaseOracleModule } from 'src/database-oracle/database-oracle.module';
import { UserModule } from 'src/user/user.module';
import { LocalAiAccessGuard } from './guards/local-ai-access.guard';
import { CHAT_HISTORY_STORE } from './history/chat-history.types';
import { RedisChatHistoryStore } from './history/redis-chat-history.store';
import { LmStudioClient } from './lm-studio/lm-studio.client';
import { LocalAiController } from './local-ai.controller';
import { LocalAiService } from './local-ai.service';
import { SchemaCatalogService } from './schema/schema-catalog.service';
import { ReadOnlyQueryService } from './sql/read-only-query.service';
import { SqlGeneratorService } from './sql/sql-generator.service';
import { SqlGuardService } from './sql/sql-guard.service';
import { LogisticsToolsService } from './tools/logistics-tools.service';
import { SqlQueryToolService } from './tools/sql-query-tool.service';
import { ToolRegistryService } from './tools/tool-registry.service';

/**
 * Локальний AI-помічник на LM Studio.
 *
 * Не перетинається з AiModule (хмарний Gemini для Telegram і пошти) — це
 * окремий контур, у якому дані не залишають мережу компанії.
 *
 * DatabaseModule і RedisModule глобальні, тому імпортуються лише
 * DatabaseOracleModule (не глобальний) і UserModule (там живе AuthGuard).
 */
@Module({
  imports: [UserModule, DatabaseOracleModule],
  controllers: [LocalAiController],
  providers: [
    LmStudioClient,
    SchemaCatalogService,
    SqlGuardService,
    ReadOnlyQueryService,
    SqlGeneratorService,
    LogisticsToolsService,
    SqlQueryToolService,
    ToolRegistryService,
    LocalAiService,
    AuthGuard,
    LocalAiAccessGuard,
    {
      // Сховище історії підмінюється тут: коли зʼявляться процедури БД,
      // достатньо замінити клас, не чіпаючи LocalAiService
      provide: CHAT_HISTORY_STORE,
      useClass: RedisChatHistoryStore,
    },
  ],
  exports: [LocalAiService, LmStudioClient],
})
export class LocalAiModule {}
