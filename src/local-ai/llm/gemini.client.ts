import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Content,
  GoogleGenerativeAI,
  Part,
  Schema,
  SchemaType,
} from '@google/generative-ai';
import { LlmClient } from './llm-client.interface';
import {
  ChatCompletionOptions,
  ChatMessage,
  LlmHealth,
  LlmProvider,
} from './llm.types';

/**
 * Конектор до Google Gemini — робочий провайдер AI-помічника.
 *
 * Єдине місце в модулі, яке знає протокол Gemini: усе інше працює через
 * [LlmClient](./llm-client.interface.ts), тому повернення на локальну модель —
 * це зміна `LOCAL_AI_PROVIDER`, а не правка сервісів.
 *
 * Ключ береться з того самого `GEMINI_API_KEY`, що й у `src/ai` (Telegram-бот
 * і пошта): другий ключ на ту саму квоту лише плодив би плутанину.
 *
 * ВАЖЛИВО щодо даних: це хмарний виклик. У промпт їде схема БД і рядки
 * вибірки, тому доступ до помічника лишається поіменним
 * (`LOCAL_AI_ALLOWED_EMAILS`), а до бази — виключно на читання.
 */
@Injectable()
export class GeminiClient implements LlmClient {
  private readonly logger = new Logger(GeminiClient.name);

  private static readonly API_BASE =
    'https://generativelanguage.googleapis.com/v1beta';

  /** Health опитується фронтом раз на хвилину — тримаємо результат стільки ж. */
  private static readonly HEALTH_TTL_MS = 60_000;

  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;
  private readonly thinkingBudget: number;
  private readonly genAI: GoogleGenerativeAI | null;

  private healthCache: { at: number; value: LlmHealth } | null = null;

  constructor(private readonly configService: ConfigService) {
    this.apiKey =
      this.configService.get<string>('GEMINI_API_KEY')?.trim() ?? '';
    this.defaultModel =
      this.configService.get<string>('LOCAL_AI_GEMINI_MODEL')?.trim() ||
      'gemini-2.5-flash';
    this.defaultTimeoutMs = Number(
      this.configService.get<string>('LOCAL_AI_LLM_TIMEOUT_MS') ?? 120000,
    );
    // Токени «роздумів» списуються з maxOutputTokens, тож із увімкненим
    // thinking модель встигала б подумати й обірватися на півслові.
    // 0 — вимкнути; більше 0 — дозволити стільки токенів на роздуми.
    this.thinkingBudget = Number(
      this.configService.get<string>('LOCAL_AI_GEMINI_THINKING_BUDGET') ?? 0,
    );

    if (!this.apiKey) {
      // Не падаємо на старті: решта бекенда має піднятися й без AI-помічника
      this.logger.error(
        'GEMINI_API_KEY не заданий — AI-помічник відповідатиме помилкою',
      );
    }

    this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
  }

  public getProvider(): LlmProvider {
    return 'gemini';
  }

  public getDefaultModel(): string {
    return this.defaultModel;
  }

  public async chat(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {},
  ): Promise<string> {
    if (!this.genAI) {
      throw new ServiceUnavailableException(
        'AI-помічник не налаштований: у конфігурації відсутній GEMINI_API_KEY',
      );
    }

    const modelName = options.model ?? this.defaultModel;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    // Системні репліки Gemini приймає окремо від діалогу, а не як роль у contents
    const systemInstruction = messages
      .filter((m) => m.role === 'system')
      .map((m) => this.toPlainText(m.content))
      .filter(Boolean)
      .join('\n\n');

    const contents = this.toContents(
      messages.filter((m) => m.role !== 'system'),
    );

    const generationConfig: Record<string, any> = {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxTokens ?? 1024,
    };

    if (options.jsonSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = this.toGeminiSchema(
        options.jsonSchema.schema,
      );
    }

    // Моделі pro вимкнути роздуми не можна — там параметр просто не передаємо
    if (Number.isFinite(this.thinkingBudget) && !/pro/i.test(modelName)) {
      generationConfig.thinkingConfig = { thinkingBudget: this.thinkingBudget };
    }

    const model = this.genAI.getGenerativeModel(
      {
        model: modelName,
        ...(systemInstruction ? { systemInstruction } : {}),
      },
      { timeout: timeoutMs },
    );

    const started = Date.now();

    try {
      const result = await model.generateContent({
        contents,
        generationConfig,
      });

      const usage = result.response.usageMetadata?.totalTokenCount;
      this.logger.debug(
        `chat: model=${modelName} tokens=${usage ?? '?'} ${Date.now() - started}ms`,
      );

      return (result.response.text() ?? '').trim();
    } catch (err: any) {
      // У повідомленні Gemini може бути URL із ключем — у лог і користувачу воно не йде
      const reason = this.describeError(err);
      this.logger.error(`Gemini недоступний (${modelName}): ${reason}`);
      throw new ServiceUnavailableException(
        `Модель Gemini недоступна: ${reason}`,
      );
    }
  }

  /**
   * Чат із гарантованою JSON-відповіддю.
   *
   * `responseSchema` тримає формат надійно, але модель усе одно іноді обгортає
   * відповідь у ```json-фенс, тому парсер поблажливий: один зайвий символ
   * не має ламати діалог.
   */
  public async chatJson<T>(
    messages: ChatMessage[],
    jsonSchema: { name: string; schema: Record<string, any> },
    options: Omit<ChatCompletionOptions, 'jsonSchema'> = {},
  ): Promise<T> {
    const raw = await this.chat(messages, { ...options, jsonSchema });
    return this.parseJson<T>(raw);
  }

  /** Gemini — хмарний сервіс, тому native tool calling у нього є завжди. */
  public async supportsNativeTools(): Promise<boolean> {
    return true;
  }

  /**
   * Перевірка ключа й моделі метаданим запитом.
   *
   * Свідомо не робимо generateContent: фронт опитує health раз на хвилину на
   * кожній відкритій вкладці, і це були б оплачені токени на порожньому місці.
   */
  public async health(): Promise<LlmHealth> {
    if (!this.apiKey) {
      return {
        available: false,
        provider: 'gemini',
        model: this.defaultModel,
        loaded: false,
        error: 'GEMINI_API_KEY не заданий',
      };
    }

    const cached = this.healthCache;
    if (cached && Date.now() - cached.at < GeminiClient.HEALTH_TTL_MS) {
      return cached.value;
    }

    let value: LlmHealth;

    try {
      const response = await fetch(
        `${GeminiClient.API_BASE}/models/${this.defaultModel}`,
        {
          method: 'GET',
          // Ключ у заголовку, а не в query: інакше він осідає в логах проксі
          headers: { 'x-goog-api-key': this.apiKey },
          signal: AbortSignal.timeout(10000),
        },
      );

      value = response.ok
        ? {
            available: true,
            provider: 'gemini',
            model: this.defaultModel,
            loaded: true,
          }
        : {
            available: false,
            provider: 'gemini',
            model: this.defaultModel,
            loaded: false,
            error: `Gemini відповів ${response.status}`,
          };
    } catch (err: any) {
      value = {
        available: false,
        provider: 'gemini',
        model: this.defaultModel,
        loaded: false,
        error: this.describeError(err),
      };
    }

    this.healthCache = { at: Date.now(), value };
    return value;
  }

  // ─────────────────────────────────────────────────────────────
  // Переклад у формат Gemini
  // ─────────────────────────────────────────────────────────────

  /** Системна репліка може прийти й мультимодальною — у systemInstruction іде лише текст. */
  private toPlainText(content: ChatMessage['content']): string {
    if (typeof content === 'string') return content;

    return content
      .filter((part) => part.type === 'text')
      .map((part) => (part as { text: string }).text)
      .join('\n');
  }

  /** OpenAI-подібні повідомлення → `contents` Gemini (assistant стає model). */
  private toContents(messages: ChatMessage[]): Content[] {
    return messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: this.toParts(message.content),
    }));
  }

  private toParts(content: string | ChatMessage['content']): Part[] {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    return content.map((part) => {
      if (part.type === 'text') return { text: part.text };

      // data:image/png;base64,.... — інші URL Gemini сам не завантажує
      const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return { text: `[зображення за посиланням: ${part.image_url.url}]` };
      }

      return { inlineData: { mimeType: match[1], data: match[2] } };
    });
  }

  /**
   * JSON Schema (наш спільний формат) → Schema Gemini.
   *
   * Gemini приймає лише підмножину OpenAPI: `additionalProperties`, `strict`,
   * `$schema` і подібне він відхиляє з 400, тому все зайве вирізаємо тут,
   * а не тримаємо два різні описи однієї схеми в local-ai.constants.ts.
   */
  private toGeminiSchema(schema: Record<string, any>): Schema {
    const types: Record<string, SchemaType> = {
      string: SchemaType.STRING,
      number: SchemaType.NUMBER,
      integer: SchemaType.INTEGER,
      boolean: SchemaType.BOOLEAN,
      array: SchemaType.ARRAY,
      object: SchemaType.OBJECT,
    };

    const type = types[String(schema.type)] ?? SchemaType.STRING;

    const converted: Record<string, any> = { type };

    if (schema.description) converted.description = schema.description;

    if (Array.isArray(schema.enum) && schema.enum.length) {
      converted.enum = schema.enum.map(String);
      // Без format:'enum' Gemini трактує enum як звичайний рядок
      converted.format = 'enum';
    }

    if (type === SchemaType.OBJECT) {
      const properties = schema.properties ?? {};
      converted.properties = Object.fromEntries(
        Object.entries(properties).map(([name, value]) => [
          name,
          this.toGeminiSchema(value as Record<string, any>),
        ]),
      );

      if (Array.isArray(schema.required) && schema.required.length) {
        converted.required = schema.required;
      }
    }

    if (type === SchemaType.ARRAY && schema.items) {
      converted.items = this.toGeminiSchema(schema.items);
    }

    return converted as Schema;
  }

  private parseJson<T>(raw: string): T {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Остання спроба: вихопити найбільший JSON-об'єкт із тексту
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch {
          /* нижче кинемо зрозумілу помилку */
        }
      }

      this.logger.error(`Модель повернула невалідний JSON: ${raw.slice(0, 500)}`);
      throw new ServiceUnavailableException(
        'Модель повернула відповідь у неочікуваному форматі',
      );
    }
  }

  /** Коротка причина без ключа й службових URL — вона йде і в лог, і користувачу. */
  private describeError(err: any): string {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return `перевищено таймаут ${this.defaultTimeoutMs} мс`;
    }

    let message = String(err?.message ?? 'невідома помилка').replace(
      /key=[^&\s]+/gi,
      'key=***',
    );

    // Ключ міг потрапити в текст помилки SDK — вирізаємо його явно
    if (this.apiKey) {
      message = message.split(this.apiKey).join('***');
    }

    return message.slice(0, 300);
  }
}
