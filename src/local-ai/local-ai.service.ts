import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { IUserProfile } from 'src/user/types/user.type';
import { CHAT_HISTORY_STORE } from './history/chat-history.types';
import type {
  ChatHistoryStore,
  ChatSession,
  MessagePage,
  SessionPage,
  StoredMessage,
} from './history/chat-history.types';
import { LLM_CLIENT } from './llm/llm-client.interface';
import type { LlmClient } from './llm/llm-client.interface';
import { ChatMessage } from './llm/llm.types';
import {
  buildAnswerPrompt,
  buildRouterPrompt,
  ROUTER_SCHEMA,
} from './local-ai.constants';
import { SchemaCatalogService } from './schema/schema-catalog.service';
import { ReadOnlyQueryService } from './sql/read-only-query.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { ToolContext } from './tools/tool.types';

interface RouterDecision {
  action: 'tool' | 'reply';
  tool: string;
  /** Рядок із JSON (див. ROUTER_SCHEMA); терпимо приймаємо й готовий обʼєкт. */
  args: string | Record<string, any>;
  reply: string;
}

export interface ChatAnswer {
  sessionId: string;
  message: StoredMessage;
  /** Дані від tool — фронт малює їх таблицею під відповіддю. */
  rows: any[];
  toolName?: string;
  meta?: Record<string, any>;
  /**
   * Переданої сесії вже не існувало (витіснив ліміт або зʼїв TTL), тому
   * відповідь збережена в новій. Фронт попереджає про це користувача.
   */
  sessionReplaced?: boolean;
}

/**
 * AI-помічник по даних компанії.
 *
 * Модель — Google Gemini через [LlmClient](./llm/llm-client.interface.ts)
 * (провайдер перемикається `LOCAL_AI_PROVIDER`). Свідомо окремий сервіс, а не
 * розширення наявного AiService: той обслуговує Telegram-бота й пошту, а тут
 * інший контракт — сесії, поіменний доступ і жорстке правило «лише читання».
 *
 * Крок обробки повідомлення:
 *   1. роутер — модель обирає tool або відповідає текстом;
 *   2. виконання tool на сервері (реєстр перевіряє права, SQL-guard — запит);
 *   3. форматування — модель переказує отримані рядки українською.
 */
@Injectable()
export class LocalAiService {
  private readonly logger = new Logger(LocalAiService.name);

  /** Скільки минулих повідомлень підмішуємо в контекст роутера. */
  private static readonly HISTORY_WINDOW = 8;

  constructor(
    @Inject(LLM_CLIENT) private readonly llm: LlmClient,
    private readonly toolRegistry: ToolRegistryService,
    private readonly schemaCatalog: SchemaCatalogService,
    private readonly readOnly: ReadOnlyQueryService,
    @Inject(CHAT_HISTORY_STORE)
    private readonly history: ChatHistoryStore,
    private readonly cls: ClsService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Сесії
  // ─────────────────────────────────────────────────────────────

  public async createSession(title = 'Нова розмова'): Promise<ChatSession> {
    return this.history.createSession(this.requireUserId(), title);
  }

  /** Сторінка списку розмов: фронт вантажить його порціями при скролі. */
  public async listSessions(
    limit?: number,
    offset?: number,
  ): Promise<SessionPage> {
    return this.history.listSessions(this.requireUserId(), { limit, offset });
  }

  /**
   * Сторінка історії від кінця розмови.
   * Фронт бере спершу хвіст (offset=0), а старіше довантажує при скролі вгору.
   */
  public async getMessages(
    sessionId: string,
    limit?: number,
    offset?: number,
  ): Promise<MessagePage> {
    return this.history.getMessages(this.requireUserId(), sessionId, {
      limit,
      offset,
    });
  }

  public async renameSession(sessionId: string, title: string): Promise<void> {
    return this.history.renameSession(this.requireUserId(), sessionId, title);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    return this.history.deleteSession(this.requireUserId(), sessionId);
  }

  /** Видалити всі розмови користувача — швидкий спосіб звільнити памʼять Redis. */
  public async deleteAllSessions(): Promise<{ deleted: number }> {
    const deleted = await this.history.deleteAllSessions(this.requireUserId());
    return { deleted };
  }

  /** Стан моделі — для індикатора в UI. */
  public async health() {
    const health = await this.llm.health();
    const schema = this.schemaCatalog.describe();

    return {
      ...health,
      nativeToolCalling: await this.llm.supportsNativeTools(),
      // Лише кількість: технічні назви функцій назовні не віддаємо —
      // на екрані вони нічого не пояснюють, а внутрішню кухню розкривають
      toolsCount: this.toolRegistry.getAvailableTools(this.buildContext('health'))
        .length,
      limits: {
        // UI показує лічильник «N з 10», тому стеля приходить із сервера,
        // а не дублюється константою на фронті
        maxSessions: this.history.getMaxSessions(),
      },
      database: {
        dialect: schema.dialect,
        oracleEnabled: this.readOnly.isOracleEnabled(),
        access: 'read-only (SELECT)',
        tables: schema.tables.length,
        relations: schema.relations.length,
        schemaSource: schema.source,
        schemaRefreshedAt: schema.refreshedAt,
      },
    };
  }

  /** Каталог таблиць, який бачить модель, — щоб адміністратор міг його перевірити. */
  public getSchema() {
    this.requireIct();
    return this.schemaCatalog.describe();
  }

  /** Перечитати схему з БД після зміни структури таблиць. */
  public async refreshSchema() {
    this.requireIct();
    await this.schemaCatalog.refresh();
    return this.schemaCatalog.describe();
  }

  // ─────────────────────────────────────────────────────────────
  // Основний сценарій
  // ─────────────────────────────────────────────────────────────

  /**
   * Обробити повідомлення користувача в межах сесії.
   * Якщо sessionId не передано — створюється нова сесія.
   */
  public async chat(
    text: string,
    sessionId?: string,
  ): Promise<ChatAnswer> {
    const user = this.getUser();
    const userId = this.requireUserId();
    const question = (text ?? '').trim();

    if (!question) {
      throw new Error('Порожнє повідомлення');
    }

    const existing = sessionId
      ? await this.history.getSession(userId, sessionId)
      : null;

    // Розмову міг витіснити ліміт або зʼїсти TTL. Діалог не обриваємо — заводимо
    // нову сесію, але кажемо про це фронту: мовчазна підміна виглядала б так,
    // ніби попереднє листування просто зникло.
    const sessionReplaced = Boolean(sessionId && !existing);
    if (sessionReplaced) {
      this.logger.warn(
        `Сесію ${sessionId} користувача ${userId} не знайдено — створюємо нову`,
      );
    }

    const session =
      existing ?? (await this.history.createSession(userId, question));

    const ctx = this.buildContext(session.id, user);

    await this.history.appendMessage(userId, session.id, {
      role: 'user',
      content: question,
    });

    const decision = await this.route(question, session.id, ctx);

    // Розмовна гілка: модель відповіла сама, дані не потрібні
    if (decision.action !== 'tool' || !decision.tool) {
      const reply =
        decision.reply?.trim() ||
        'Не вдалося сформувати відповідь. Спробуйте переформулювати запит.';

      const stored = await this.history.appendMessage(userId, session.id, {
        role: 'assistant',
        content: reply,
      });

      return { sessionId: session.id, message: stored, rows: [], sessionReplaced };
    }

    // Гілка з даними: виконуємо tool на сервері й даємо моделі переказати результат
    try {
      const result = await this.toolRegistry.execute(
        decision.tool,
        this.parseArgs(decision.args),
        ctx,
      );

      const answer = await this.formatAnswer(question, result, user);

      const stored = await this.history.appendMessage(userId, session.id, {
        role: 'assistant',
        content: answer,
        toolName: decision.tool,
        rows: result.rows.slice(0, 50),
        meta: result.meta,
      });

      return {
        sessionId: session.id,
        message: stored,
        rows: result.rows,
        toolName: decision.tool,
        sessionReplaced,
        meta: {
          ...result.meta,
          rowCount: result.rowCount,
          truncated: result.truncated,
        },
      };
    } catch (err: any) {
      // Помилку показуємо користувачу як звичайну відповідь — діалог не має обриватися
      this.logger.error(
        `Виконання tool ${decision.tool} не вдалося: ${err?.message}`,
      );

      const reply = `Не вдалося отримати дані: ${err?.message ?? 'невідома помилка'}`;
      const stored = await this.history.appendMessage(userId, session.id, {
        role: 'assistant',
        content: reply,
        toolName: decision.tool,
      });

      return {
        sessionId: session.id,
        message: stored,
        rows: [],
        toolName: decision.tool,
        sessionReplaced,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Внутрішні кроки
  // ─────────────────────────────────────────────────────────────

  /** Крок 1: модель вирішує, чи потрібні дані, і якщо так — які саме. */
  private async route(
    question: string,
    sessionId: string,
    ctx: ToolContext,
  ): Promise<RouterDecision> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: buildRouterPrompt(
          this.toolRegistry.describeForPrompt(ctx),
          new Date().toISOString().slice(0, 10),
        ),
      },
      ...(await this.buildHistoryContext(sessionId)),
      { role: 'user', content: question },
    ];

    try {
      const decision = await this.llm.chatJson<RouterDecision>(
        messages,
        { name: 'router_decision', schema: ROUTER_SCHEMA as any },
        { temperature: 0 },
      );

      this.logger.log(
        `Роутер: action=${decision.action} tool=${decision.tool || '-'} args=${JSON.stringify(this.parseArgs(decision.args))}`,
      );
      return decision;
    } catch (err: any) {
      // Якщо модель не змогла в JSON — не валимо діалог, відповідаємо текстом
      this.logger.warn(`Роутер не дав валідного рішення: ${err?.message}`);
      return {
        action: 'reply',
        tool: '',
        args: {},
        reply:
          'Не вдалося розібрати запит. Спробуйте сформулювати конкретніше — наприклад, «покажи затримані рейси за сьогодні».',
      };
    }
  }

  /**
   * Аргументи tool із рішення роутера.
   *
   * За схемою вони приходять рядком із JSON (Gemini не приймає обʼєкт без
   * переліку властивостей у responseSchema), але модель час від часу віддає
   * готовий обʼєкт — приймаємо обидва варіанти, бо інакше через дрібницю
   * формату втрачається вся відповідь.
   */
  private parseArgs(raw: string | Record<string, any> | undefined): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;

    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    if (!cleaned || cleaned === '{}') return {};

    try {
      const parsed = JSON.parse(cleaned);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.logger.warn(`Не вдалося розібрати args роутера: ${cleaned.slice(0, 200)}`);
      return {};
    }
  }

  /** Крок 3: модель переказує рядки з БД людською мовою. */
  private async formatAnswer(
    question: string,
    result: { summary: string; rows: any[]; truncated?: boolean },
    user: IUserProfile | null,
  ): Promise<string> {
    // У промпт віддаємо обмежену вибірку: повний масив роздуває контекст і сповільнює модель
    const preview = result.rows.slice(0, 30);

    const payload = [
      `Питання користувача: ${question}`,
      `Підсумок: ${result.summary}`,
      result.truncated
        ? 'Увага: результат обрізано лімітом рядків, це не всі дані.'
        : '',
      `Дані (JSON, до 30 рядків):`,
      JSON.stringify(preview, null, 1),
    ]
      .filter(Boolean)
      .join('\n');

    const fullName = user?.person
      ? [user.person.surname, user.person.name].filter(Boolean).join(' ')
      : undefined;

    try {
      const answer = await this.llm.chat(
        [
          { role: 'system', content: buildAnswerPrompt(fullName) },
          { role: 'user', content: payload },
        ],
        { temperature: 0.2, maxTokens: 900 },
      );

      return answer || result.summary;
    } catch (err: any) {
      // Модель могла відвалитися вже після успішного запиту до БД —
      // краще віддати сухий підсумок, ніж втратити отримані дані
      this.logger.warn(`Форматування відповіді не вдалося: ${err?.message}`);
      return result.summary;
    }
  }

  /** Останні репліки діалогу — щоб модель розуміла уточнення на кшталт «а за минулий місяць?». */
  private async buildHistoryContext(
    sessionId: string,
  ): Promise<ChatMessage[]> {
    const { messages } = await this.history.getMessages(
      this.requireUserId(),
      sessionId,
      { limit: LocalAiService.HISTORY_WINDOW },
    );

    return messages.map((m) => ({
      role: m.role,
      // Табличні дані в контекст не тягнемо — модель має спиратися на свіжий виклик tool
      content: m.content,
    }));
  }

  private buildContext(
    sessionId: string,
    user?: IUserProfile | null,
  ): ToolContext {
    return { user: user ?? this.getUser(), sessionId };
  }

  private getUser(): IUserProfile | null {
    return this.cls.get('user') ?? null;
  }

  /**
   * Каталог схеми — це опис внутрішньої кухні компанії (таблиці, правила, приклади),
   * тому він закритий тією самою роллю, що й tool runSqlQuery. Рольового гарда в
   * проєкті немає (@Authorization ролі ігнорує), тож перевірка тут, у сервісі.
   */
  private requireIct(): void {
    const role = this.getUser()?.role;

    if (!role?.is_ict && !role?.is_admin) {
      throw new ForbiddenException(
        'Каталог схеми доступний лише співробітникам ICT',
      );
    }
  }

  private requireUserId(): number {
    const user = this.getUser();
    if (!user?.id) {
      // Сюди можна потрапити лише в обхід AuthGuard — наприклад із крона.
      // Мовчазна робота з порожнім користувачем дала б дані іншого обсягу, тому падаємо явно.
      throw new Error('Локальний AI доступний лише автентифікованим користувачам');
    }
    return user.id;
  }
}
