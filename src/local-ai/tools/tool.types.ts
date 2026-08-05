import { IUserProfile } from 'src/user/types/user.type';

/** Контекст виконання tool — хто питає і в межах якої сесії. */
export interface ToolContext {
  user: IUserProfile | null;
  sessionId: string;
}

/** Результат tool у вигляді, придатному і для моделі, і для таблиці на фронті. */
export interface ToolResult {
  /** Короткий підсумок для моделі (вона перетворює його на людську відповідь). */
  summary: string;
  /** Табличні дані — фронт малює їх як таблицю під відповіддю. */
  rows: any[];
  /** Скільки рядків реально знайдено (може бути більше за rows.length). */
  rowCount?: number;
  /** Чи обрізаний результат лімітом. */
  truncated?: boolean;
  /** Довільні метадані конкретного tool (період, фільтри тощо). */
  meta?: Record<string, any>;
}

/**
 * Опис одного tool.
 *
 * `parameters` — JSON Schema аргументів. Вона йде і в промпт роутера,
 * і (за потреби) у native tools OpenAI-протоколу, тому формат один.
 */
export interface AiTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  /** Хто має право викликати. Порожньо = будь-який автентифікований користувач. */
  roles?: Array<'admin' | 'ict'>;
  execute: (args: Record<string, any>, ctx: ToolContext) => Promise<ToolResult>;
}
