import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Context, Markup } from 'telegraf';
import { TelegramService } from '../telegram.service';
import { canProvTz } from './tz-prov.access';
import { TzCarrier, TzItem, TzKind, TzProvService, TzTooManyError } from './tz-prov.service';

/** Сцена очікування тексту пошуку перевізника (обробляє TelegramUpdate.handleAllMessages). */
export const TZ_PROV_SEARCH_SCENE = 'tzprov_search';

const PAGE_SIZE = 10;
const PERIODS = [2, 30, 90, 180, 365];

/** «2 дні», «30 днів» — українське узгодження з числом. */
function daysLabel(d: number): string {
  const n10 = d % 10;
  const n100 = d % 100;
  if (n10 === 1 && n100 !== 11) return `${d} день`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${d} дні`;
  return `${d} днів`;
}

interface TzProvState {
  kind?: TzKind;
  days?: number;
  kodPer?: string;
  perName?: string;
  items?: TzItem[];
  selected?: string[];
  page?: number;
  running?: boolean;
  /**
   * Знімок того, що показано на екрані підтвердження. Кнопка «Так, провести» несе
   * його nonce — стара кнопка з давнішого повідомлення не проведе поточний вибір.
   */
  pending?: {
    nonce: string;
    kodPer: string;
    perName: string;
    kind: TzKind;
    days: number;
    /** Ключі вибору (TzItem.key) */
    keys: string[];
  };
}

type Btn = ReturnType<typeof Markup.button.callback>;

const KIND_TEXT: Record<TzKind, { many: string; icon: string; genitive: string }> = {
  am: { many: 'Тягачі', icon: '🚛', genitive: 'тягачів' },
  pr: { many: 'Причепи', icon: '🚃', genitive: 'причепів' },
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function short(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** « · заявка №5827 +2» — № останньої заявки з цим номером (і скільки ще), якщо є. */
function zayLabel(zayNum?: string, zayCount?: number): string {
  if (!zayNum) return '';
  const more = zayCount && zayCount > 1 ? ` +${zayCount - 1}` : '';
  return ` · заявка №${zayNum}${more}`;
}

function itemLabel(it: TzItem): string {
  const zay = zayLabel(it.zayNum, it.zayCount);
  if (it.source === 'new') return `🆕 ${it.dernom}${zay}`;
  return `${it.dernom}${zay}${it.marka ? ` · ${short(it.marka, 14)}` : ''}`;
}

/**
 * Діалог «Провести номери» в боті: тип (тягачі/причепи) → період → перевізник
 * (зі списку тих, у кого є непроведені, або пошуком) → позначити номери →
 * підтвердити. Доступ — лише Telegram ID зі списку tz-prov.access.ts.
 */
@Injectable()
export class TzProvFlow {
  private readonly logger = new Logger(TzProvFlow.name);

  constructor(
    private readonly service: TzProvService,
    private readonly telegramService: TelegramService,
  ) {}

  // ---------- службове ----------

  private state(ctx: Context): TzProvState {
    const session = (ctx as any).session ?? ((ctx as any).session = {});
    session.tzprov ??= {};
    return session.tzprov as TzProvState;
  }

  private reset(ctx: Context) {
    const session = (ctx as any).session;
    if (session) {
      session.tzprov = {};
      this.leaveSearch(ctx);
    }
  }

  /** Будь-який крок, крім самого запиту пошуку, виходить із режиму введення назви. */
  private leaveSearch(ctx: Context) {
    const session = (ctx as any).session;
    if (session?.scene === TZ_PROV_SEARCH_SCENE) session.scene = undefined;
  }

  /** Перевіряє доступ; для callback одразу відповідає, щоб кнопка не «крутилась». */
  async guard(ctx: Context, cbText?: string): Promise<boolean> {
    const isCallback = Boolean((ctx as any).callbackQuery);
    if (!canProvTz(ctx.from?.id)) {
      if (isCallback) {
        try { await ctx.answerCbQuery('⛔️ Немає доступу до проведення номерів'); } catch {}
      } else {
        await ctx.reply('⛔️ У вас немає доступу до проведення номерів.');
      }
      return false;
    }
    if (isCallback) {
      try { await ctx.answerCbQuery(cbText); } catch {}
    }
    return true;
  }

  private async render(ctx: Context, text: string, rows: Btn[][]) {
    const extra = { parse_mode: 'HTML' as const, ...Markup.inlineKeyboard(rows) };
    if ((ctx as any).callbackQuery) {
      try {
        await ctx.editMessageText(text, extra);
        return;
      } catch (e: any) {
        const desc = String(e?.response?.description ?? e?.description ?? e?.message ?? '');
        // Подвійне натискання — той самий екран уже показаний; нове повідомлення лише задублює кнопки
        if (desc.includes('message is not modified')) return;
        // Нове повідомлення — лише коли старе справді не редагується (видалене / застаре)
        if (!/message to edit not found|message can't be edited/i.test(desc)) {
          this.logger.warn(`Не вдалося оновити повідомлення: ${desc}`);
          return;
        }
      }
    }
    await ctx.reply(text, extra);
  }

  private menuRow(): Btn[] {
    return [Markup.button.callback('⬅️ Меню', 'main_menu')];
  }

  // ---------- крок 1: що проводимо ----------

  async start(ctx: Context) {
    this.reset(ctx);
    await this.render(
      ctx,
      '🚛 <b>Проведення номерів</b>\n\n' +
        'Бот вносить у транспорт перевізника тягачі чи причепи із заявок, яких ще немає в його списку: ' +
        'нові номери з непроведених заявок (🆕 — саме через них заявка не проводиться) і номери з уже ' +
        'проведених заявок (як функція в програмі). Після цього заявки з цими номерами проходять ' +
        'перевірку транспорту.\n\nЩо проводимо?',
      [
        [
          Markup.button.callback(`${KIND_TEXT.am.icon} ${KIND_TEXT.am.many}`, 'tzp:kind:am'),
          Markup.button.callback(`${KIND_TEXT.pr.icon} ${KIND_TEXT.pr.many}`, 'tzp:kind:pr'),
        ],
        this.menuRow(),
      ],
    );
  }

  // ---------- крок 2: період ----------

  async chooseKind(ctx: Context, kind: TzKind) {
    this.leaveSearch(ctx);
    const st = this.state(ctx);
    st.kind = kind;
    st.days = undefined;
    await this.render(
      ctx,
      `${KIND_TEXT[kind].icon} <b>${KIND_TEXT[kind].many}</b>\n\nЗа який період брати заявки?`,
      [
        [Markup.button.callback('🕐 Останні 2 дні (сьогодні й учора)', 'tzp:days:2')],
        PERIODS.slice(1, 3).map((d) => Markup.button.callback(daysLabel(d), `tzp:days:${d}`)),
        PERIODS.slice(3).map((d) => Markup.button.callback(daysLabel(d), `tzp:days:${d}`)),
        [Markup.button.callback('⬅️ Назад', 'tzp:start')],
      ],
    );
  }

  // ---------- крок 3: перевізник ----------

  async chooseDays(ctx: Context, days: number) {
    this.leaveSearch(ctx);
    const st = this.state(ctx);
    if (!st.kind || !PERIODS.includes(days)) return this.start(ctx);
    st.days = days;
    st.kodPer = undefined;
    st.items = undefined;
    st.selected = undefined;
    st.pending = undefined;

    const kind = st.kind;
    await this.render(ctx, '⏳ Шукаю перевізників з непроведеними номерами…', []);
    let carriers: TzCarrier[];
    try {
      carriers = await this.service.carriersWithPending(kind, days);
    } catch (e) {
      this.logger.error('carriersWithPending failed', e as Error);
      return this.render(ctx, '❌ Не вдалося отримати дані з бази. Спробуйте пізніше.', [
        [Markup.button.callback('🔄 Спробувати ще', `tzp:days:${days}`)],
        this.menuRow(),
      ]);
    }

    const head = `${KIND_TEXT[kind].icon} <b>${KIND_TEXT[kind].many}</b> · ${daysLabel(days)}\n\n`;
    const text = carriers.length
      ? head + `Перевізники, у яких є непроведені ${KIND_TEXT[kind].genitive} (у дужках — скільки; 🆕 — нові номери з непроведених заявок):`
      : head + `За цей період непроведених ${KIND_TEXT[kind].genitive} немає. Можна знайти перевізника вручну.`;

    await this.render(ctx, text, [
      ...carriers.map((c) => [
        Markup.button.callback(
          `${c.newCount ? '🆕 ' : ''}${short(c.name, 34)} (${c.count}${c.newCount ? ` · нових ${c.newCount}` : ''})`,
          `tzp:car:${c.kod}`,
        ),
      ]),
      [Markup.button.callback('🔍 Знайти перевізника (назва / ЄДРПОУ)', 'tzp:search')],
      [Markup.button.callback('⬅️ Назад', `tzp:kind:${kind}`)],
    ]);
  }

  async askSearch(ctx: Context) {
    const st = this.state(ctx);
    if (!st.kind || !st.days) return this.start(ctx);
    (ctx as any).session.scene = TZ_PROV_SEARCH_SCENE;
    await this.render(ctx, '🔍 Надішліть частину назви перевізника або його ЄДРПОУ.', [
      [Markup.button.callback('⬅️ Назад', `tzp:days:${st.days}`)],
    ]);
  }

  /** Текст у сцені пошуку (викликається з TelegramUpdate.handleAllMessages). */
  async handleSearchText(ctx: Context, text: string | undefined) {
    if (!(await this.guard(ctx))) {
      this.reset(ctx);
      return;
    }
    const st = this.state(ctx);
    if (!st.kind || !st.days) {
      this.reset(ctx);
      return this.start(ctx);
    }
    if (!text || text.trim().length < 2) {
      await ctx.reply('Надішліть щонайменше 2 символи назви або ЄДРПОУ.');
      return;
    }

    let found: TzCarrier[];
    try {
      found = await this.service.searchCarriers(text);
    } catch (e) {
      this.logger.error('searchCarriers failed', e as Error);
      await ctx.reply('❌ Не вдалося виконати пошук. Спробуйте ще раз.');
      return;
    }
    if (!found.length) {
      await ctx.reply(`Нічого не знайдено за «${esc(text.trim())}». Спробуйте іншу назву або ЄДРПОУ.`, {
        parse_mode: 'HTML',
      });
      return;
    }

    (ctx as any).session.scene = undefined;
    await this.render(ctx, `Знайдено за «${esc(text.trim())}»:`, [
      ...found.map((c) => [
        Markup.button.callback(`${short(c.name, 40)}${c.zkpo ? ` · ${c.zkpo}` : ''}`, `tzp:car:${c.kod}`),
      ]),
      [Markup.button.callback('🔍 Шукати ще', 'tzp:search')],
      [Markup.button.callback('⬅️ Назад', `tzp:days:${st.days}`)],
    ]);
  }

  // ---------- крок 4: позначити номери ----------

  async chooseCarrier(ctx: Context, kodPer: string) {
    this.leaveSearch(ctx);
    const st = this.state(ctx);
    st.pending = undefined;
    if (!st.kind || !st.days) return this.start(ctx);
    const kind = st.kind;
    const days = st.days;

    await this.render(ctx, '⏳ Завантажую номери перевізника…', []);
    try {
      const carrier = await this.service.getCarrier(kodPer);
      if (!carrier) {
        return this.render(ctx, '❌ Перевізника не знайдено.', [[Markup.button.callback('⬅️ Назад', `tzp:days:${days}`)]]);
      }
      const items = await this.service.getPending(kodPer, kind, days);
      st.kodPer = kodPer;
      st.perName = carrier.name;
      st.items = items;
      st.selected = [];
      st.page = 0;
    } catch (e) {
      if (e instanceof TzTooManyError) {
        return this.render(ctx, '⚠️ За цей період номерів забагато для однієї вибірки. Оберіть коротший період.', [
          [Markup.button.callback('⬅️ Обрати період', `tzp:kind:${kind}`)],
        ]);
      }
      this.logger.error('getPending failed', e as Error);
      return this.render(ctx, '❌ Не вдалося отримати номери з бази. Спробуйте пізніше.', [
        [Markup.button.callback('⬅️ Назад', `tzp:days:${days}`)],
      ]);
    }

    if (!st.items!.length) {
      return this.render(
        ctx,
        `✅ У перевізника <b>${esc(st.perName)}</b> немає непроведених ${KIND_TEXT[kind].genitive} ` +
          `із заявок за ${daysLabel(days)}.`,
        [[Markup.button.callback('⬅️ Інший перевізник', `tzp:days:${days}`)], this.menuRow()],
      );
    }
    return this.showSelection(ctx);
  }

  async showSelection(ctx: Context) {
    this.leaveSearch(ctx);
    const st = this.state(ctx);
    if (!st.kind || !st.items || !st.kodPer) return this.start(ctx);
    const items = st.items;
    const selected = new Set(st.selected ?? []);
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const page = Math.min(Math.max(st.page ?? 0, 0), pages - 1);
    st.page = page;

    const from = page * PAGE_SIZE;
    const rows: Btn[][] = items.slice(from, from + PAGE_SIZE).map((it, i) => [
      Markup.button.callback(
        `${selected.has(it.key) ? '✅' : '⬜'} ${itemLabel(it)}`,
        `tzp:tog:${from + i}`,
      ),
    ]);

    if (pages > 1) {
      rows.push([
        Markup.button.callback(page > 0 ? '◀️' : '·', page > 0 ? `tzp:page:${page - 1}` : 'tzp:noop'),
        Markup.button.callback(`${page + 1} / ${pages}`, 'tzp:noop'),
        Markup.button.callback(page < pages - 1 ? '▶️' : '·', page < pages - 1 ? `tzp:page:${page + 1}` : 'tzp:noop'),
      ]);
    }
    rows.push([
      selected.size === items.length
        ? Markup.button.callback('⬜ Зняти всі', 'tzp:none')
        : Markup.button.callback(`☑️ Вибрати всі (${items.length})`, 'tzp:all'),
    ]);
    if (selected.size) {
      rows.push([Markup.button.callback(`✅ Провести вибрані (${selected.size})`, 'tzp:go')]);
    }
    rows.push([
      Markup.button.callback('⬅️ Інший перевізник', `tzp:days:${st.days}`),
      Markup.button.callback('❌ Скасувати', 'main_menu'),
    ]);

    const kt = KIND_TEXT[st.kind];
    await this.render(
      ctx,
      `${kt.icon} <b>${esc(st.perName)}</b>\n` +
        `${kt.many} із заявок за ${daysLabel(st.days!)}, яких ще немає в транспорті перевізника: <b>${items.length}</b>\n` +
        (items.some((i) => i.source === 'new')
          ? '🆕 — новий номер із непроведеної заявки (саме він блокує її проведення)\n'
          : '') +
        `Вибрано: <b>${selected.size}</b>\n\nПозначте потрібні номери й натисніть «Провести вибрані».`,
      rows,
    );
  }

  async toggle(ctx: Context, index: number) {
    const st = this.state(ctx);
    const item = st.items?.[index];
    if (!item) return this.showSelection(ctx);
    const selected = new Set(st.selected ?? []);
    if (selected.has(item.key)) selected.delete(item.key);
    else selected.add(item.key);
    st.selected = [...selected];
    st.pending = undefined;
    return this.showSelection(ctx);
  }

  async selectAll(ctx: Context, all: boolean) {
    const st = this.state(ctx);
    st.selected = all ? (st.items ?? []).map((i) => i.key) : [];
    st.pending = undefined;
    return this.showSelection(ctx);
  }

  async setPage(ctx: Context, page: number) {
    this.state(ctx).page = page;
    return this.showSelection(ctx);
  }

  // ---------- крок 5: підтвердження ----------

  async confirm(ctx: Context) {
    const st = this.state(ctx);
    if (!st.kind || !st.items || !st.kodPer) return this.start(ctx);
    const chosen = st.items.filter((i) => st.selected?.includes(i.key));
    if (!chosen.length) return this.showSelection(ctx);

    const nonce = randomBytes(4).toString('hex');
    st.pending = {
      nonce,
      kodPer: st.kodPer,
      perName: st.perName ?? '',
      kind: st.kind,
      days: st.days!,
      keys: chosen.map((i) => i.key),
    };

    const kt = KIND_TEXT[st.kind];
    const list = chosen
      .slice(0, 30)
      .map((i) => `• ${esc(itemLabel(i))}`)
      .join('\n');
    const more = chosen.length > 30 ? `\n…і ще ${chosen.length - 30}` : '';

    await this.render(
      ctx,
      `❓ <b>Провести ${chosen.length} ${kt.genitive}?</b>\n\n` +
        `Перевізник: <b>${esc(st.perName)}</b>\n\n${list}${more}\n\n` +
        'Номери буде внесено в транспорт перевізника в базі, і заявки з ними проходитимуть перевірку.',
      [
        [Markup.button.callback('✅ Так, провести', `tzp:yes:${nonce}`)],
        [Markup.button.callback('⬅️ Назад до вибору', 'tzp:sel')],
      ],
    );
  }

  // ---------- крок 6: виконання ----------

  /** nonce — з кнопки «Так, провести»; проводимо саме той знімок, що був показаний. */
  async execute(ctx: Context, nonce: string) {
    const st = this.state(ctx);
    const snap = st.pending;
    if (!snap || snap.nonce !== nonce) {
      return this.render(ctx, '⚠️ Це підтвердження застаріле — вибір уже змінився. Перевірте номери ще раз.', [
        [Markup.button.callback('🚛 Почати заново', 'tzp:start')],
        this.menuRow(),
      ]);
    }
    // Захист від подвійного натискання: знімок одноразовий
    if (st.running) return;
    st.running = true;
    st.pending = undefined;

    const kt = KIND_TEXT[snap.kind];
    const name =
      [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || ctx.from?.username || '—';
    const who = `${ctx.from?.id} (${name})`;

    try {
      await this.render(ctx, `⏳ Проводжу ${snap.keys.length} ${kt.genitive}…`, []);
      const res = await this.service.provesti(snap.kodPer, snap.kind, snap.days, snap.keys, `tg:${ctx.from?.id}`);
      this.logger.log(
        `Проведення номерів: tg ${who}, перевізник ${snap.kodPer} (${snap.perName}), ${snap.kind}, ` +
          `запит ${res.requested}, внесено ${res.applied.length}, пропущено ${res.skipped.length}, ` +
          `не внесено ${res.failed.length}${res.error ? `, помилка: ${res.error}` : ''}`,
      );

      const lines: string[] = [];
      lines.push(
        res.applied.length
          ? `✅ <b>Проведено ${res.applied.length} ${kt.genitive}</b> перевізнику <b>${esc(snap.perName)}</b>:`
          : `⚠️ Нічого не проведено для <b>${esc(snap.perName)}</b>.`,
      );
      for (const a of res.applied.slice(0, 40)) {
        lines.push(
          `• ${a.source === 'new' ? '🆕 ' : ''}${esc(a.dernom)}${esc(zayLabel(a.zayNum))}` +
            `${a.notOwned ? ' — як «не власність» (номер уже числиться власним в іншого перевізника)' : ''}`,
        );
      }
      if (res.applied.length > 40) lines.push(`…і ще ${res.applied.length - 40}`);
      if (res.skipped.length) {
        lines.push('', `ℹ️ Уже не потребували проведення (хтось провів раніше): ${res.skipped.length}`);
      }
      if (res.failed.length) {
        lines.push('', `❌ Не вдалося внести: ${res.failed.map(esc).join(', ')}`);
      }
      if (res.error) lines.push('', `Помилка бази: ${esc(res.error)}`);

      st.items = undefined;
      st.selected = undefined;
      await this.render(ctx, lines.join('\n'), [
        [Markup.button.callback('🚛 Провести ще', 'tzp:start')],
        this.menuRow(),
      ]);

      // Слід поза ротацією логів: кожне проведення — службове повідомлення головному адміну
      void this.telegramService.notifyAdmin(
        `🚛 <b>Проведення номерів (бот)</b>\n` +
          `Хто: ${esc(who)}\nПеревізник: ${esc(snap.perName)} (#${esc(snap.kodPer)})\n` +
          `${kt.many}: внесено ${res.applied.length} з ${res.requested}` +
          (res.applied.length
            ? `\n${res.applied
                .slice(0, 30)
                .map((a) => esc(a.dernom) + (a.zayNum ? ` (№${esc(a.zayNum)})` : ''))
                .join(', ')}`
            : '') +
          (res.failed.length ? `\nНе внесено: ${res.failed.map(esc).join(', ')}` : '') +
          (res.error ? `\nПомилка: ${esc(res.error)}` : ''),
      );
    } catch (e) {
      this.logger.error(`Проведення номерів впало: tg ${who}, перевізник ${snap.kodPer}`, e as Error);
      void this.telegramService.notifyAdmin(
        `❌ <b>Проведення номерів (бот) впало</b>\nХто: ${esc(who)}\n` +
          `Перевізник: ${esc(snap.perName)} (#${esc(snap.kodPer)})`,
      );
      await this.render(ctx, '❌ Не вдалося провести номери. Спробуйте ще раз пізніше.', [
        [Markup.button.callback('⬅️ Назад до вибору', 'tzp:sel')],
        this.menuRow(),
      ]).catch(() => undefined);
    } finally {
      st.running = false;
    }
  }
}

