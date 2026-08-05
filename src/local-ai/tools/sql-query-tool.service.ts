import { Injectable, Logger } from '@nestjs/common';
import { ReadOnlyQueryService } from '../sql/read-only-query.service';
import { SqlGeneratorService } from '../sql/sql-generator.service';
import { AiTool, ToolContext, ToolResult } from './tool.types';

/**
 * `runSqlQuery` — універсальний tool, у якому модель пише SQL сама.
 *
 * Решта tools лишаються фіксованими запитами: вони швидші, передбачувані й
 * покривають типові питання. Цей tool — для всього іншого, чого не передбачили
 * заздалегідь («скільки тендерів без жодної ставки», «які компанії в чорному списку»).
 *
 * Ланцюг довіри тут довший, тому й обмежень більше:
 *   1. SqlGeneratorService бачить лише каталог дозволених таблиць;
 *   2. SqlGuardService пропускає ЛИШЕ SELECT по цих таблицях — DROP/DELETE/UPDATE
 *      відхиляються до звернення до БД;
 *   3. запит виконується в READ ONLY-транзакції Postgres зі statement_timeout.
 *
 * Доступ — лише ICT та адміністратори: довільна вибірка по всій схемі показала б
 * перевізнику ставки конкурентів, чого фіксовані tools не дозволяють.
 *
 * Джерело одне — Postgres. Oracle для локальної моделі вимкнено.
 */
@Injectable()
export class SqlQueryToolService {
  private readonly logger = new Logger(SqlQueryToolService.name);

  /** Скільки разів даємо моделі виправити власний запит. */
  private static readonly MAX_ATTEMPTS = 2;

  constructor(
    private readonly sqlGenerator: SqlGeneratorService,
    private readonly readOnly: ReadOnlyQueryService,
  ) {}

  public getTools(): AiTool[] {
    return [this.runSqlQuery()];
  }

  private runSqlQuery(): AiTool {
    return {
      name: 'runSqlQuery',
      description:
        'Довільний запит до бази тендерної платформи (Postgres): тендери, ставки перевізників, переможці, компанії, працівники, відділи, заявки CRM, транспорт, файли. ' +
        'Викликай ЛИШЕ тоді, коли жодна інша функція не підходить: коли потрібен нестандартний зріз, фільтр, підрахунок чи порівняння. ' +
        'Запит працює лише на ЧИТАННЯ — змінити чи видалити дані ним неможливо.',
      roles: ['ict', 'admin'],
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description:
              'Питання українською, повністю самодостатнє — з періодом, фільтрами й тим, що саме порахувати. ' +
              'Не пиши SQL, лише питання.',
          },
        },
        required: ['question'],
      },
      execute: async (args, ctx): Promise<ToolResult> => {
        const question = String(args.question ?? '').trim();
        if (!question) {
          return { summary: 'Не вказано, які саме дані потрібні', rows: [] };
        }

        const maxRows = this.readOnly.getMaxRows();
        let failed: { sql: string; error: string } | undefined;

        for (let attempt = 1; attempt <= SqlQueryToolService.MAX_ATTEMPTS; attempt++) {
          const generated = await this.sqlGenerator.generate(
            question,
            maxRows,
            failed,
          );

          // Модель чесно каже, що даних для відповіді в схемі немає — це не помилка
          if (!generated.sql) {
            return {
              summary:
                generated.explanation ||
                'На це питання неможливо відповісти доступними таблицями',
              rows: [],
              meta: { generatedSql: null, attempts: attempt },
            };
          }

          try {
            const result = await this.readOnly.run(generated.sql, 'postgres', {
              userId: ctx.user?.id,
              source: `runSqlQuery.attempt${attempt}`,
            });

            return {
              summary: `${generated.explanation || 'Виконано запит до бази'}. Рядків: ${result.rowCount}${result.truncated ? ` (обрізано лімітом ${maxRows})` : ''}`,
              rows: result.rows,
              rowCount: result.rowCount,
              truncated: result.truncated,
              meta: {
                source: 'Postgres (SQL згенеровано моделлю)',
                // SQL віддаємо на фронт свідомо: користувач має бачити, звідки цифри
                generatedSql: generated.sql,
                explanation: generated.explanation,
                attempts: attempt,
                durationMs: result.durationMs,
              },
            };
          } catch (err: any) {
            const message = err?.message ?? 'невідома помилка';

            if (attempt === SqlQueryToolService.MAX_ATTEMPTS) {
              this.logger.warn(
                `runSqlQuery вичерпав спроби: ${message} | ${generated.sql}`,
              );
              throw err;
            }

            this.logger.warn(
              `runSqlQuery спроба ${attempt} невдала (${message}), просимо модель виправити запит`,
            );
            failed = { sql: generated.sql, error: message };
          }
        }

        // Недосяжно: цикл або повертає результат, або кидає помилку на останній спробі
        return { summary: 'Не вдалося сформувати запит до бази', rows: [] };
      },
    };
  }
}
