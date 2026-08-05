import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { LogisticsToolsService } from './logistics-tools.service';
import { SqlQueryToolService } from './sql-query-tool.service';
import { AiTool, ToolContext, ToolResult } from './tool.types';

/**
 * Реєстр tools і єдина точка їх виконання.
 *
 * Модель ніколи не викликає функцію напряму — вона лише називає ім'я й аргументи,
 * а реєстр перевіряє існування tool, права користувача й лише тоді виконує логіку.
 * Саме тут проходить межа довіри між LLM і бізнес-даними.
 */
@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, AiTool>();

  constructor(
    private readonly logisticsTools: LogisticsToolsService,
    private readonly sqlQueryTool: SqlQueryToolService,
  ) {
    // Спершу фіксовані запити, далі універсальний runSqlQuery —
    // порядок визначає й порядок у промпті, а модель схильна брати перший відповідний
    for (const tool of [
      ...this.logisticsTools.getTools(),
      ...this.sqlQueryTool.getTools(),
    ]) {
      this.tools.set(tool.name, tool);
    }
    this.logger.log(`Зареєстровано tools: ${[...this.tools.keys()].join(', ')}`);
  }

  /** Tools, доступні конкретному користувачу — саме їх бачить модель у промпті. */
  public getAvailableTools(ctx: ToolContext): AiTool[] {
    return [...this.tools.values()].filter((tool) => this.isAllowed(tool, ctx));
  }

  /** Компактний опис tools для системного промпту роутера. */
  public describeForPrompt(ctx: ToolContext): string {
    return this.getAvailableTools(ctx)
      .map((tool) => {
        const params = Object.entries(tool.parameters.properties)
          .map(([name, schema]: [string, any]) => {
            const required = tool.parameters.required?.includes(name)
              ? ' (обовʼязковий)'
              : '';
            const values = schema.enum ? ` [${schema.enum.join('|')}]` : '';
            return `    - ${name}: ${schema.type}${values}${required} — ${schema.description ?? ''}`;
          })
          .join('\n');

        return `- ${tool.name}: ${tool.description}\n  Аргументи:\n${params}`;
      })
      .join('\n\n');
  }

  /**
   * Виконати tool за іменем. Кидає ForbiddenException, якщо tool немає
   * або користувачу він недоступний за роллю.
   */
  public async execute(
    name: string,
    args: Record<string, any>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      this.logger.warn(`Модель попросила неіснуючий tool: ${name}`);
      throw new ForbiddenException(`Невідома функція: ${name}`);
    }

    if (!this.isAllowed(tool, ctx)) {
      this.logger.warn(
        `Користувач ${ctx.user?.id ?? '-'} не має доступу до tool ${name}`,
      );
      throw new ForbiddenException(
        `Функція ${name} доступна лише співробітникам ICT`,
      );
    }

    const started = Date.now();
    this.logger.log(
      `TOOL ${name} user=${ctx.user?.id ?? '-'} args=${JSON.stringify(args)}`,
    );

    try {
      const result = await tool.execute(args ?? {}, ctx);
      this.logger.log(
        `TOOL ${name} OK rows=${result.rows.length} ${Date.now() - started}ms`,
      );
      return result;
    } catch (err: any) {
      this.logger.error(
        `TOOL ${name} FAILED ${Date.now() - started}ms: ${err?.message}`,
      );
      throw err;
    }
  }

  private isAllowed(tool: AiTool, ctx: ToolContext): boolean {
    if (!tool.roles?.length) return true;

    const role = ctx.user?.role;
    if (!role) return false;

    return tool.roles.some((needed) =>
      needed === 'admin' ? role.is_admin : role.is_ict,
    );
  }
}
