import { Inject, Injectable, Logger } from '@nestjs/common';
import { LLM_CLIENT } from '../llm/llm-client.interface';
import type { LlmClient } from '../llm/llm-client.interface';
import { ChatMessage } from '../llm/llm.types';
import {
  buildSqlPrompt,
  buildSqlRetryPrompt,
  SQL_SCHEMA,
} from '../local-ai.constants';
import { SchemaCatalogService } from '../schema/schema-catalog.service';

export interface GeneratedSql {
  /** Порожній рядок = модель вважає, що відповісти цими таблицями неможливо. */
  sql: string;
  explanation: string;
}

/** Невдала спроба, яку показуємо моделі, щоб вона виправилася. */
export interface FailedAttempt {
  sql: string;
  error: string;
}

/**
 * Перетворення питання українською на SELECT для Postgres.
 *
 * Це нова межа довіри: раніше модель лише називала tool, тепер вона пише текст
 * запиту. Тому все, що звідси виходить, ОБОВʼЯЗКОВО проходить SqlGuardService —
 * цей сервіс сам нічого не виконує і жодних гарантій безпеки не дає.
 *
 * Схема таблиць береться з SchemaCatalogService (жива інтроспекція БД), тож
 * модель бачить фактичні колонки, а не те, що памʼятає з навчання.
 */
@Injectable()
export class SqlGeneratorService {
  private readonly logger = new Logger(SqlGeneratorService.name);

  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    private readonly schemaCatalog: SchemaCatalogService,
  ) {}

  /**
   * Згенерувати SQL. `failed` — попередня спроба з текстом помилки:
   * з ним модель виправляє конкретну проблему замість повторення того самого.
   */
  public async generate(
    question: string,
    maxRows: number,
    failed?: FailedAttempt,
  ): Promise<GeneratedSql> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: buildSqlPrompt(
          this.schemaCatalog.buildPromptSchema(),
          new Date().toISOString().slice(0, 10),
          maxRows,
        ),
      },
      { role: 'user', content: question },
    ];

    if (failed) {
      messages.push({
        role: 'user',
        content: buildSqlRetryPrompt(failed.sql, failed.error),
      });
    }

    const result = await this.llm.chatJson<GeneratedSql>(
      messages,
      { name: 'sql_query', schema: SQL_SCHEMA as any },
      // Нуль температури: SQL — не творчість, різні відповіді на те саме питання шкодять
      { temperature: 0, maxTokens: 1200 },
    );

    const sql = this.normalize(result?.sql ?? '');

    this.logger.log(
      `SQL згенеровано${failed ? ' (повторна спроба)' : ''}: ${sql || '<порожньо>'}`,
    );

    return { sql, explanation: (result?.explanation ?? '').trim() };
  }

  /**
   * Модель любить обгортати запит у ```sql-фенс і розбивати переносами.
   * Однорядковий SQL потрібен і валідатору (пошук коментарів), і логам.
   */
  private normalize(raw: string): string {
    return raw
      .replace(/```sql/gi, '')
      .replace(/```/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/;+\s*$/, '');
  }
}
