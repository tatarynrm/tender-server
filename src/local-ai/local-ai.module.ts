import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { DatabaseOracleModule } from 'src/database-oracle/database-oracle.module';
import { UserModule } from 'src/user/user.module';
import { LocalAiAccessGuard } from './guards/local-ai-access.guard';
import { CHAT_HISTORY_STORE } from './history/chat-history.types';
import { RedisChatHistoryStore } from './history/redis-chat-history.store';
import { GeminiClient } from './llm/gemini.client';
import { LLM_CLIENT, LlmClient } from './llm/llm-client.interface';
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
 * AI-помічник по даних компанії.
 *
 * Модель обирається тут і тільки тут: за замовчуванням Google Gemini,
 * `LOCAL_AI_PROVIDER=lmstudio` повертає локальну модель. Решта сервісів
 * залежить від токена LLM_CLIENT, тому перемикання не зачіпає їхній код.
 *
 * Не перетинається з AiModule (Gemini для Telegram і пошти): там свій контур
 * і свої промпти, спільний лише ключ GEMINI_API_KEY.
 *
 * DatabaseModule і RedisModule глобальні, тому імпортуються лише
 * DatabaseOracleModule (не глобальний) і UserModule (там живе AuthGuard).
 */
@Module({
  imports: [UserModule, DatabaseOracleModule],
  controllers: [LocalAiController],
  providers: [
    GeminiClient,
    LmStudioClient,
    {
      provide: LLM_CLIENT,
      inject: [ConfigService, GeminiClient, LmStudioClient],
      useFactory: (
        config: ConfigService,
        gemini: GeminiClient,
        lmStudio: LmStudioClient,
      ): LlmClient => {
        const provider =
          config.get<string>('LOCAL_AI_PROVIDER')?.trim().toLowerCase() ??
          'gemini';
        const client = provider === 'lmstudio' ? lmStudio : gemini;

        // Провайдер визначає, чи виходять дані компанії за периметр,
        // тому вибір видно в логах старту, а не лише в .env
        new Logger('LocalAiModule').log(
          `AI-помічник працює на ${client.getProvider()} (${client.getDefaultModel()})`,
        );

        return client;
      },
    },
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
  exports: [LocalAiService, LLM_CLIENT],
})
export class LocalAiModule {}
