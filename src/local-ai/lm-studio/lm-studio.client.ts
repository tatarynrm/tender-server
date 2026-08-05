import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ChatCompletionOptions,
  ChatCompletionResponse,
  ChatMessage,
  LmStudioModelInfo,
} from './lm-studio.types';

/**
 * Конектор до локального LM Studio.
 *
 * Єдине місце в проєкті, яке знає про HTTP-протокол локальної LLM. Усе інше
 * (LocalAiService, tools) працює через методи цього класу, тому заміна моделі
 * чи навіть раннера зводиться до зміни env-змінних або цього одного файлу.
 *
 * Хмарних викликів тут немає навмисно: дані компанії не залишають локальну мережу.
 */
@Injectable()
export class LmStudioClient {
  private readonly logger = new Logger(LmStudioClient.name);

  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    // Дефолти підібрані під типову локальну інсталяцію, щоб модуль піднявся без правок .env
    this.baseUrl = (
      this.configService.get<string>('LM_STUDIO_URL') ?? 'http://localhost:1234'
    ).replace(/\/+$/, '');
    this.defaultModel =
      this.configService.get<string>('LM_STUDIO_MODEL') ??
      'qwen/qwen2.5-vl-7b';
    this.defaultTimeoutMs = Number(
      this.configService.get<string>('LM_STUDIO_TIMEOUT_MS') ?? 120000,
    );
  }

  public getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Звичайний чат-запит. Повертає текст відповіді моделі.
   */
  public async chat(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {},
  ): Promise<string> {
    const body: Record<string, any> = {
      model: options.model ?? this.defaultModel,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1024,
      stream: false,
    };

    if (options.jsonSchema) {
      // LM Studio підтримує structured output через json_schema — це наш замінник tool calling
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: options.jsonSchema.name,
          strict: true,
          schema: options.jsonSchema.schema,
        },
      };
    }

    const started = Date.now();
    const data = await this.post<ChatCompletionResponse>(
      '/v1/chat/completions',
      body,
      options.timeoutMs ?? this.defaultTimeoutMs,
    );

    const content = data.choices?.[0]?.message?.content ?? '';
    this.logger.debug(
      `chat: model=${body.model} tokens=${data.usage?.total_tokens ?? '?'} ${Date.now() - started}ms`,
    );

    return content.trim();
  }

  /**
   * Чат із гарантованою JSON-відповіддю за схемою.
   *
   * Модель іноді обгортає JSON у ```json-фенс навіть зі strict-схемою,
   * тому парсер тут поблажливий — інакше один зайвий символ ламає весь діалог.
   */
  public async chatJson<T>(
    messages: ChatMessage[],
    jsonSchema: { name: string; schema: Record<string, any> },
    options: Omit<ChatCompletionOptions, 'jsonSchema'> = {},
  ): Promise<T> {
    const raw = await this.chat(messages, { ...options, jsonSchema });
    return this.parseJson<T>(raw);
  }

  /** Список моделей із розширеного ендпоінта (є state і capabilities). */
  public async listModels(): Promise<LmStudioModelInfo[]> {
    const data = await this.get<{ data: LmStudioModelInfo[] }>(
      '/api/v0/models',
      10000,
    );
    return data.data ?? [];
  }

  /**
   * Чи підтримує модель нативний tool calling.
   *
   * Практична причина існування методу: qwen2.5-vl-7b параметр `tools` мовчки
   * ігнорує (повертає порожній tool_calls), тому LocalAiService за замовчуванням
   * маршрутизує виклики через JSON-схему, а не через native tools.
   */
  public async supportsNativeTools(model?: string): Promise<boolean> {
    try {
      const target = model ?? this.defaultModel;
      const models = await this.listModels();
      const info = models.find((m) => m.id === target);
      return Boolean(info?.capabilities?.includes('tool_use'));
    } catch {
      return false;
    }
  }

  /** Перевірка доступності локального сервера — для health-ендпоінта. */
  public async health(): Promise<{
    available: boolean;
    model: string;
    loaded: boolean;
    error?: string;
  }> {
    try {
      const models = await this.listModels();
      const info = models.find((m) => m.id === this.defaultModel);
      return {
        available: true,
        model: this.defaultModel,
        loaded: info?.state === 'loaded',
      };
    } catch (err: any) {
      return {
        available: false,
        model: this.defaultModel,
        loaded: false,
        error: err?.message ?? 'unknown error',
      };
    }
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
        'Локальна модель повернула відповідь у неочікуваному форматі',
      );
    }
  }

  private async post<T>(path: string, body: any, timeoutMs: number): Promise<T> {
    return this.request<T>(path, timeoutMs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async get<T>(path: string, timeoutMs: number): Promise<T> {
    return this.request<T>(path, timeoutMs, { method: 'GET' });
  }

  private async request<T>(
    path: string,
    timeoutMs: number,
    init: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new ServiceUnavailableException(
          `LM Studio відповів ${response.status}: ${text.slice(0, 300)}`,
        );
      }

      return (await response.json()) as T;
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException) throw err;

      const reason =
        err?.name === 'TimeoutError' || err?.name === 'AbortError'
          ? `перевищено таймаут ${timeoutMs} мс`
          : (err?.message ?? 'невідома помилка');

      this.logger.error(`LM Studio недоступний (${url}): ${reason}`);
      throw new ServiceUnavailableException(
        `Локальна модель недоступна: ${reason}. Перевірте, чи запущений LM Studio на ${this.baseUrl}`,
      );
    }
  }
}
