import { Action, Command, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { TzKind } from './tz-prov.service';
import { TzProvFlow } from './tz-prov.flow';

/**
 * Кнопки й команди «Провести номери». Уся логіка — у TzProvFlow;
 * доступ перевіряє flow.guard() у кожному хендлері (наявність кнопки — не захист).
 */
@Update()
export class TzProvUpdate {
  constructor(private readonly flow: TzProvFlow) {}

  private data(ctx: Context): string {
    return (ctx as any).callbackQuery?.data ?? '';
  }

  /** Будь-хто може дізнатися свій Telegram ID — щоб його додали в список доступу. */
  @Command('myid')
  async myId(ctx: Context) {
    await ctx.reply(`Ваш Telegram ID: <code>${ctx.from?.id ?? '—'}</code>`, { parse_mode: 'HTML' });
  }

  @Command('numbers')
  @Action('tzp:start')
  async start(ctx: Context) {
    if (!(await this.flow.guard(ctx))) return;
    await this.flow.start(ctx);
  }

  @Action(/^tzp:kind:(am|pr)$/)
  async kind(ctx: Context) {
    if (!(await this.flow.guard(ctx))) return;
    await this.flow.chooseKind(ctx, this.data(ctx).split(':')[2] as TzKind);
  }

  @Action(/^tzp:days:\d+$/)
  async days(ctx: Context) {
    if (!(await this.flow.guard(ctx))) return;
    await this.flow.chooseDays(ctx, Number(this.data(ctx).split(':')[2]));
  }

  @Action('tzp:search')
  async search(ctx: Context) {
    if (!(await this.flow.guard(ctx))) return;
    await this.flow.askSearch(ctx);
  }

  @Action(/^tzp:car:\d+$/)
  async carrier(ctx: Context) {
    if (!(await this.flow.guard(ctx))) return;
    await this.flow.chooseCarrier(ctx, this.data(ctx).split(':')[2]);
  }

  @Action(/^tzp:tog:\d+$/)
  async toggle(ctx: Context) {
    if (!(await this.flow.guard(ctx))) return;
    await this.flow.toggle(ctx, Number(this.data(ctx).split(':')[2]));
  }

  @Action(/^tzp:page:\d+$/)
  async page(ctx: Context) {
    if (!(await this.flow.guard(ctx))) return;
    await this.flow.setPage(ctx, Number(this.data(ctx).split(':')[2]));
  }

  @Action(/^tzp:(all|none)$/)
  async all(ctx: Context) {
    if (!(await this.flow.guard(ctx))) return;
    await this.flow.selectAll(ctx, this.data(ctx) === 'tzp:all');
  }

  @Action('tzp:sel')
  async backToSelection(ctx: Context) {
    if (!(await this.flow.guard(ctx))) return;
    await this.flow.showSelection(ctx);
  }

  @Action('tzp:go')
  async confirm(ctx: Context) {
    if (!(await this.flow.guard(ctx))) return;
    await this.flow.confirm(ctx);
  }

  // nonce у кнопці прив'язує підтвердження до показаного знімка вибору
  @Action(/^tzp:yes:[0-9a-f]{8}$/)
  async execute(ctx: Context) {
    if (!(await this.flow.guard(ctx, '⏳ Проводжу…'))) return;
    await this.flow.execute(ctx, this.data(ctx).split(':')[2]);
  }

  @Action('tzp:noop')
  async noop(ctx: Context) {
    try { await ctx.answerCbQuery(); } catch {}
  }
}
