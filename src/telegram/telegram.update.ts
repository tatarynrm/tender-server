import { Action, Command, Hears, InjectBot, Start, Update, On } from 'nestjs-telegraf';
import { Context, Telegraf, Markup } from 'telegraf';
import { TelegramService } from './telegram.service';
import { MESSAGES } from './common/telegram.messages';
import { UserGateway } from 'src/user/user.gateway';
import {
  MailReaderService,
  UnreadDigestItem,
} from 'src/mail-reader/mail-reader.service';
import { ApprovalService } from 'src/approval/approval.service';
import { ClaudeAgentService } from 'src/claude-agent/claude-agent.service';
import {
  TelegramAccess,
  buildMainMenu,
  BACK_TO_MENU_KEYBOARD,
  formatProfile,
  formatActiveTendersList,
  formatActiveTendersTeaser,
  formatCompanyRates,
  formatCompanyWins,
  formatIctSummary,
} from './telegram.menu';

// --- Режим звітів по тендерах (тільки для адміністраторів ІСТ: is_ict + is_admin) ---
const REPORT_EXIT_BUTTON = '🚪 Вийти зі звітів';
const REPORT_EXAMPLES_BUTTON = '💡 Приклади звітів';
// Кнопки швидких звітів: текст кнопки → готове запитання для ШІ-агента
const REPORT_QUICK_QUESTIONS: Record<string, string> = {
  '📊 Тендери по відділах за місяць':
    'Скільки тендерів виставив кожен відділ за останні 30 днів? Покажи кількість тендерів по кожному відділу, відсортуй за спаданням.',
  '📈 Активність відділів за тиждень':
    'Покажи активність відділів за останні 7 днів: скільки тендерів створено кожним відділом і скільки ставок перевізників отримали їхні тендери.',
};

@Update()
export class TelegramUpdate {
  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly telegramService: TelegramService,
    private readonly userGateway: UserGateway,
    private readonly mailReaderService: MailReaderService,
    private readonly approvalService: ApprovalService,
    private readonly claudeAgentService: ClaudeAgentService,
  ) {}

  // --- Погодження дій Claude Code -----------------------------------------
  // Дві стадії навмисно: перше натискання нічого не вирішує, лише показує
  // другу пару кнопок. Сповіщення легко зачепити випадково, а рішення тут
  // незворотні.

  @Action(/^apv:[a-f0-9]+:(yes|no)$/)
  async handleApprovalPress(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId || !this.telegramService.isAdmin(telegramId)) {
      return ctx.answerCbQuery('⛔️ Немає прав');
    }

    const [, id, verdict] = (ctx.callbackQuery as any).data.split(':');
    const rec = await this.approvalService.firstPress(id, verdict === 'yes');

    if (!rec) {
      await ctx.answerCbQuery('Запит прострочений');
      return ctx.editMessageText('⏱ Запит на погодження прострочений.');
    }

    if (rec.status === 'denied') {
      await ctx.answerCbQuery('Заборонено');
      return ctx.editMessageText(`⛔️ Заборонено\n\n${rec.summary}`);
    }

    if (rec.status !== 'confirming') {
      return ctx.answerCbQuery('Це вже вирішено');
    }

    await ctx.answerCbQuery();
    return ctx.editMessageText(
      `❓ Підтвердіть ще раз\n\nІнструмент: ${rec.tool}\nДія: ${rec.summary}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Так, дозволяю', `apv2:${id}:yes`),
          Markup.button.callback('⛔️ Ні, скасувати', `apv2:${id}:no`),
        ],
      ]),
    );
  }

  @Action(/^apv2:[a-f0-9]+:(yes|no)$/)
  async handleApprovalConfirm(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId || !this.telegramService.isAdmin(telegramId)) {
      return ctx.answerCbQuery('⛔️ Немає прав');
    }

    const [, id, verdict] = (ctx.callbackQuery as any).data.split(':');
    const rec = await this.approvalService.confirm(id, verdict === 'yes');

    if (!rec) {
      await ctx.answerCbQuery('Запит прострочений');
      return ctx.editMessageText('⏱ Запит на погодження прострочений.');
    }

    await ctx.answerCbQuery(rec.status === 'approved' ? 'Погоджено' : 'Заборонено');
    return ctx.editMessageText(
      rec.status === 'approved'
        ? `✅ Погоджено\n\nІнструмент: ${rec.tool}\nДія: ${rec.summary}`
        : `⛔️ Заборонено\n\nІнструмент: ${rec.tool}\nДія: ${rec.summary}`,
    );
  }

  @Start()
  async startCommand(ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return ctx.reply('Не вдалося отримати ваш ID');

      const token = (ctx as any).payload;

      if (token) {
        const user = await this.telegramService.findByTelegramToken(token);
        if (user) {
          await this.telegramService.updateTelegramId(
            user.id,
            telegramId,
            ctx.from.username ?? '',
            ctx.from.first_name ?? '',
          );
          
          await this.userGateway.emitToUser(String(user.id), 'telegram_connected', {
            telegram_id: telegramId,
          });

          await ctx.reply('✅ Telegram успішно підключено!', Markup.removeKeyboard());
          return;
        } else {
          await ctx.reply('❌ Токен не знайдено або він вже використаний.', Markup.removeKeyboard());
          return;
        }
      }

      const access = await this.telegramService.getAccess(telegramId);
      if (!access.registered) {
        const unregistered = MESSAGES.UNREGISTERED_USER(process.env.ALLOWED_ORIGIN!);
        await ctx.reply(unregistered.text, unregistered.options);
        return;
      }

      // Скидаємо сцену звітів/ШІ і залишки reply-клавіатури, потім — рольове меню
      if ((ctx as any).session) (ctx as any).session.scene = undefined;
      await ctx.reply(
        '👋 Вітаємо! Ви підключені до системи сповіщень ICT Tender.',
        Markup.removeKeyboard(),
      );
      await this.showMainMenu(ctx, access);
    } catch (err) {
      console.error(err);
      await ctx.reply('Сталася помилка, спробуйте пізніше.');
    }
  }

  // --- Рольове головне меню ------------------------------------------------
  // Набір кнопок залежить від рівня доступу (див. TelegramAccess):
  // перевізник → ставки/перемоги; is_ict → зведення й активні тендери;
  // is_ict + is_admin → звіти ШІ та статистика; TELEGRAM_ADMIN_ID → системне.
  // Кожен хендлер перевіряє роль сам — наявність кнопки не є захистом.

  private portalUrl(): string {
    return (process.env.ALLOWED_ORIGIN || 'https://tender.ict.lviv.ua').replace(/\/+$/, '');
  }

  private async showMainMenu(ctx: Context, access: TelegramAccess, edit = false) {
    // Фоново підганяємо персональний список команд під роль користувача,
    // щоб у меню Telegram не світилися команди, до яких немає доступу.
    if (ctx.from?.id) {
      void this.telegramService.syncUserCommands(ctx.from.id, access);
    }

    const title = access.isIctAdmin
      ? '👑 <b>Меню адміністратора ІСТ</b>'
      : access.isIct
        ? '🏢 <b>Меню менеджера ІСТ</b>'
        : '🚚 <b>Головне меню</b>';
    const hello = access.fullName ? `\n${escapeHtml(access.fullName)}` : '';
    const text = `${title}${hello}\n\nОберіть розділ 👇`;
    const keyboard = buildMainMenu(access, this.portalUrl());

    if (edit && (ctx as any).callbackQuery) {
      try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
        return;
      } catch {
        // повідомлення могло бути видалене або незмінне — шлемо нове
      }
    }
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }

  /** Доступ користувача; для непідключених шле інструкцію й повертає null. */
  private async requireAccess(ctx: Context): Promise<TelegramAccess | null> {
    const telegramId = ctx.from?.id;
    if (!telegramId) return null;

    const access = await this.telegramService.getAccess(telegramId);
    if (!access.registered) {
      const unregistered = MESSAGES.UNREGISTERED_USER(process.env.ALLOWED_ORIGIN!);
      await ctx.reply(unregistered.text, unregistered.options);
      return null;
    }
    return access;
  }

  @Command('menu')
  @Action('main_menu')
  async handleMainMenu(ctx: Context) {
    const isCallback = Boolean((ctx as any).callbackQuery);
    if (isCallback) {
      try { await ctx.answerCbQuery(); } catch {}
    }

    const access = await this.requireAccess(ctx);
    if (!access) return;

    // Меню завжди виводить із режиму звітів/ШІ
    if ((ctx as any).session) (ctx as any).session.scene = undefined;
    await this.showMainMenu(ctx, access, isCallback);
  }

  @Command('profile')
  @Action('my_profile')
  async handleMyProfile(ctx: Context) {
    if ((ctx as any).callbackQuery) {
      try { await ctx.answerCbQuery(); } catch {}
    }

    const access = await this.requireAccess(ctx);
    if (!access) return;

    await ctx.reply(formatProfile(access), {
      parse_mode: 'HTML',
      ...BACK_TO_MENU_KEYBOARD,
    });
  }

  @Command('tenders')
  @Action('active_tenders')
  async handleActiveTenders(ctx: Context) {
    if ((ctx as any).callbackQuery) {
      try { await ctx.answerCbQuery(); } catch {}
    }

    const access = await this.requireAccess(ctx);
    if (!access) return;

    try {
      if (access.isIct) {
        // Менеджери ІСТ бачать деталі напрямків прямо в боті
        const rows = await this.telegramService.getActiveTenders(10);
        await ctx.reply(formatActiveTendersList(rows), {
          parse_mode: 'HTML',
          ...BACK_TO_MENU_KEYBOARD,
        });
        return;
      }

      // Перевізникам — лише кількість і посилання: видимість конкретних
      // тендерів (рейтинг, коло учасників) вирішують процедури БД на порталі.
      const count = await this.telegramService.getActiveTendersCount();
      await ctx.reply(formatActiveTendersTeaser(count), {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.url('🌐 Перейти до тендерів', `${this.portalUrl()}/dashboard`)],
          [Markup.button.callback('⬅️ Меню', 'main_menu')],
        ]),
      });
    } catch (err) {
      console.error('handleActiveTenders error:', err);
      await ctx.reply('❌ Не вдалося отримати тендери. Спробуйте пізніше.', BACK_TO_MENU_KEYBOARD);
    }
  }

  @Action('my_rates')
  async handleMyRates(ctx: Context) {
    try { await ctx.answerCbQuery(); } catch {}

    const access = await this.requireAccess(ctx);
    if (!access) return;
    if (!access.companyId) {
      return ctx.reply('⚠️ Ваш профіль не прив’язаний до компанії.', BACK_TO_MENU_KEYBOARD);
    }

    try {
      const rows = await this.telegramService.getCompanyRates(access.companyId, 10);
      await ctx.reply(formatCompanyRates(rows), {
        parse_mode: 'HTML',
        ...BACK_TO_MENU_KEYBOARD,
      });
    } catch (err) {
      console.error('handleMyRates error:', err);
      await ctx.reply('❌ Не вдалося отримати ставки. Спробуйте пізніше.', BACK_TO_MENU_KEYBOARD);
    }
  }

  @Action('my_wins')
  async handleMyWins(ctx: Context) {
    try { await ctx.answerCbQuery(); } catch {}

    const access = await this.requireAccess(ctx);
    if (!access) return;
    if (!access.companyId) {
      return ctx.reply('⚠️ Ваш профіль не прив’язаний до компанії.', BACK_TO_MENU_KEYBOARD);
    }

    try {
      const rows = await this.telegramService.getCompanyWins(access.companyId, 10);
      await ctx.reply(formatCompanyWins(rows), {
        parse_mode: 'HTML',
        ...BACK_TO_MENU_KEYBOARD,
      });
    } catch (err) {
      console.error('handleMyWins error:', err);
      await ctx.reply('❌ Не вдалося отримати дані. Спробуйте пізніше.', BACK_TO_MENU_KEYBOARD);
    }
  }

  @Command('summary')
  @Action('ict_summary')
  async handleIctSummary(ctx: Context) {
    if ((ctx as any).callbackQuery) {
      try { await ctx.answerCbQuery(); } catch {}
    }

    const access = await this.requireAccess(ctx);
    if (!access) return;
    if (!access.isIct) {
      return ctx.reply('⛔️ Зведення доступне лише працівникам ІСТ.', BACK_TO_MENU_KEYBOARD);
    }

    try {
      const summary = await this.telegramService.getIctSummary();
      await ctx.reply(formatIctSummary(summary), {
        parse_mode: 'HTML',
        ...BACK_TO_MENU_KEYBOARD,
      });
    } catch (err) {
      console.error('handleIctSummary error:', err);
      await ctx.reply('❌ Не вдалося зібрати зведення. Спробуйте пізніше.', BACK_TO_MENU_KEYBOARD);
    }
  }

  @Command('deploy')
  @Action('run_deploy')
  async handleDeploy(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId || !this.telegramService.isAdmin(telegramId)) {
      return ctx.reply('⛔️ У вас немає прав для виконання цієї команди.');
    }

    if ('callback_query' in ctx.update) {
      await ctx.answerCbQuery('Запускаю деплой...');
    }

    // "/deploy force" — перезібрати, навіть якщо в git нічого не змінилося
    const text = (ctx.message as any)?.text ?? '';
    const force = /\bforce\b/i.test(text);

    const started = this.telegramService.startDeploy(telegramId, force);

    if (!started) {
      return ctx.reply('❌ Не вдалося запустити скрипт деплою. Дивись логи бекенда.');
    }

    // Далі звітує сам скрипт: pm2 restart all вбиває цей процес разом із ботом,
    // тому дочекатися результату тут неможливо в принципі.
    await ctx.reply(
      [
        '🚀 Деплой запущено' + (force ? ' (примусово)' : ''),
        '',
        '1. git fetch + reset --hard origin/main в обох репозиторіях',
        '2. npm install + build — спершу бекенд, потім фронт',
        '3. pm2 restart all — тільки якщо обидві збірки пройшли',
        '',
        'Про кожен крок і про результат напише окреме повідомлення.',
        'Якщо збірка впаде — pm2 не чіпається, прод лишається на старій версії.',
      ].join('\n'),
    );
  }


  /**
   * `/task [server|front] <опис>` — автономна задача Claude Code.
   *
   * Результат — гілка з кодом і посилання на diff. У main нічого не йде,
   * pm2 не чіпається: викочування лишається окремою свідомою дією (/deploy).
   */
  @Command('task')
  async handleTask(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId || !this.telegramService.isAdmin(telegramId)) {
      return ctx.reply('⛔️ У вас немає прав для виконання цієї команди.');
    }

    const text = String((ctx.message as any)?.text ?? '');
    let body = text.replace(/^\/task(@\S+)?\s*/i, '').trim();

    // перше слово може вказувати репозиторій; типово — фронт
    let target: 'client' | 'server' = 'client';
    const firstWord = body.split(/\s+/)[0]?.toLowerCase();
    if (['server', 'бек', 'бекенд', 'backend'].includes(firstWord)) {
      target = 'server';
      body = body.slice(firstWord.length).trim();
    } else if (['client', 'front', 'фронт', 'фронтенд'].includes(firstWord)) {
      body = body.slice(firstWord.length).trim();
    }

    if (body.length < 15) {
      return ctx.reply(
        [
          'Опиши задачу докладніше — від опису прямо залежить результат.',
          '',
          'Приклад:',
          '/task Сторінка в LOG зі статистикою тендерів за 24 місяці:',
          'графік кількості по місяцях і таблиця середніх ставок по напрямках.',
          '',
          'Типово задача йде у фронт. Для бекенда: /task server <опис>',
        ].join('\n'),
      );
    }

    if (this.claudeAgentService.isBusy()) {
      return ctx.reply(
        '⏳ Уже виконується інша задача. Робочий каталог один, тому дочекайся звіту про попередню.',
      );
    }

    const requestedBy =
      ctx.from?.username ?? ctx.from?.first_name ?? String(telegramId);

    const started = this.claudeAgentService.start({
      chatId: telegramId,
      target,
      task: body,
      requestedBy,
    });

    if (!started.ok) {
      return ctx.reply(`❌ Не вдалося запустити задачу: ${started.reason}`);
    }

    await ctx.reply(
      [
        '🤖 Задача передана Claude',
        '',
        `Репозиторій: ${target === 'server' ? 'бекенд' : 'фронт'}`,
        '',
        'Далі звітую окремими повідомленнями: прогрес, перевірка збірки,',
        'потім кнопка на пуш гілки. Це 10-20 хвилин.',
        '',
        'Прод не чіпаю: ні main, ні pm2. Вийде гілка й посилання на diff.',
      ].join('\n'),
    );
  }

  @Action('get_stats')
  async handleStats(ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    // Статистика підписників не містить чутливого — відкрита адміністраторам ІСТ
    const access = await this.telegramService.getAccess(telegramId);
    if (!access.isIctAdmin && !access.isSuperAdmin) {
      return ctx.answerCbQuery('⛔️ Немає прав');
    }

    const stats = await this.telegramService.getSubscriberStats();
    try { await ctx.answerCbQuery(); } catch {}
    await ctx.reply(
      `📊 *Статистика бота:*\n\n` +
      `👥 Всього підписників: *${stats.total}*\n` +
      `🏢 Менеджери ICT: *${stats.ict_count}*\n` +
      `🚚 Перевізники: *${stats.carrier_count}*`,
      { parse_mode: 'Markdown', ...BACK_TO_MENU_KEYBOARD }
    );
  }

  @Command('mail')
  @Action('check_unread_mail')
  async handleUnreadMail(ctx: Context) {
    const telegramId = ctx.from?.id;
    const isCallback = Boolean((ctx as any).callbackQuery);
    if (isCallback) {
      try { await ctx.answerCbQuery(); } catch {}
    }

    if (!telegramId || !this.telegramService.isAdmin(telegramId)) {
      return ctx.reply('⛔️ У вас немає прав для цієї команди.');
    }

    const statusMsg = await ctx.reply('📬 Перевіряю непрочитані листи, зачекайте…');
    const chatId = ctx.chat!.id;
    const statusMsgId = statusMsg.message_id;

    // Fire-and-forget: IMAP + AI можуть зайняти час, а webhook має відповісти одразу.
    void (async () => {
      try {
        await ctx.sendChatAction('typing');
        const digest = await this.mailReaderService.getUnreadDigest(15);
        const text = formatUnreadDigest(digest);

        await ctx.telegram.editMessageText(chatId, statusMsgId, undefined, text, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Оновити', 'check_unread_mail')],
          ]),
        });
      } catch (err) {
        console.error('handleUnreadMail error:', err);
        try {
          await ctx.telegram.editMessageText(
            chatId,
            statusMsgId,
            undefined,
            '❌ Не вдалося отримати листи. Спробуйте пізніше.',
          );
        } catch {
          await ctx.telegram.sendMessage(chatId, '❌ Не вдалося отримати листи. Спробуйте пізніше.');
        }
      }
    })();
  }

  @Command('info')
  @Action('bot_info')
  async infoCommand(ctx: Context) {
    if ((ctx as any).callbackQuery) {
      try { await ctx.answerCbQuery(); } catch {}
    }
    await ctx.reply(
      markdownToHtml(
        'ℹ️ **Про бота**\n\n' +
        'Бот надсилає сповіщення про тендери та важливі події платформи ICT Tender, а через меню (команда /menu) дає швидкий доступ до:\n\n' +
        '• 👤 вашого профілю;\n' +
        '• 📢 активних тендерів;\n' +
        '• 💰 ставок і 🏆 перемог вашої компанії (для перевізників);\n' +
        '• 📈 зведення активності (для менеджерів ІСТ).\n\n' +
        '🚀 Функціонал поступово розширюється — слідкуйте за оновленнями!'
      ),
      { parse_mode: 'HTML', ...BACK_TO_MENU_KEYBOARD }
    );
  }

  @Command('ai')
  @Action('enter_ai')
  async enterAiScene(ctx: Context) {
    // ШІ-Агент тимчасово недоступний
    if ((ctx as any).callbackQuery) await ctx.answerCbQuery();
    return ctx.reply('⛔️ ШІ-Агент тимчасово недоступний. Спробуйте пізніше.');
  }

  /**
   * `/reports` — ШІ-агент звітів по тендерах (Gemini поверх Postgres).
   * Доступ лише для адміністраторів ІСТ: ролі is_ict + is_admin у person_role.
   */
  @Command('reports')
  @Action('enter_reports')
  async enterReportsScene(ctx: Context) {
    if ((ctx as any).callbackQuery) {
      try { await ctx.answerCbQuery(); } catch {}
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const isIctAdmin = await this.telegramService.checkUserHasAiAccess(telegramId);
    if (!isIctAdmin) {
      return ctx.reply('⛔️ Звіти доступні лише адміністраторам ІСТ.');
    }

    const session = (ctx as any).session;
    if (session) {
      session.scene = 'report';
      session.ai_mode = 'postgres';
    }

    await ctx.reply(
      markdownToHtml(
        '📊 **Режим звітів по тендерах**\n\n' +
        'Опишіть потрібний звіт своїми словами (текстом або голосовим) — я згенерую його з даних тендерної платформи.\n\n' +
        'Наприклад:\n' +
        '• *"Скільки тендерів виставив відділ міжнародних перевезень за липень?"*\n' +
        '• *"Чи була активність по тендерах комерційного відділу цього тижня?"*\n' +
        '• *"Порівняй відділи за кількістю закритих тендерів за квартал"*'
      ),
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([
          [Object.keys(REPORT_QUICK_QUESTIONS)[0]],
          [Object.keys(REPORT_QUICK_QUESTIONS)[1]],
          [REPORT_EXAMPLES_BUTTON, REPORT_EXIT_BUTTON],
        ]).resize(),
      },
    );
  }

  @Command('exit')
  @Action('exit_ai')
  async exitAiScene(ctx: Context) {
    if ((ctx as any).callbackQuery) {
      try { await ctx.answerCbQuery(); } catch {}
    }
    if ((ctx as any).session) {
      (ctx as any).session.scene = undefined;
    }
    await ctx.reply('🚪 Ви вийшли з режиму помічника.', Markup.removeKeyboard());

    // Після виходу одразу повертаємо користувача в головне меню
    const telegramId = ctx.from?.id;
    if (telegramId) {
      const access = await this.telegramService.getAccess(telegramId);
      if (access.registered) {
        await this.showMainMenu(ctx, access);
      }
    }
  }

  @On('message')
  async handleAllMessages(ctx: Context) {
    const session = (ctx as any).session;
    const scene = session?.scene;
    if (!session || (scene !== 'ai' && scene !== 'report')) {
      // Не в режимі ШІ/звітів — пропускаємо повідомлення далі
      return;
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const message: any = ctx.message;
    const text = message?.text;
    const voiceFileId = message?.voice?.file_id;

    if (scene === 'report') {
      await this.handleReportMessage(ctx, text, voiceFileId);
      return;
    }

    if (text === '🚪 Вийти з ШІ-Агента') {
      await this.exitAiScene(ctx);
      return;
    }

    if (text === '🟢 Тендерна платформа') {
      session.ai_mode = 'postgres';
      await ctx.reply(
        markdownToHtml(
          '🔌 **Активовано режим: Тендерна платформа (PostgreSQL)**\n\n' +
          'Тепер Ви можете ставити запитання щодо тендерів, ставок, вантажів або перевізників.'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (text === '🔴 БАЗА') {
      session.ai_mode = 'oracle';
      await ctx.reply(
        markdownToHtml(
          '🔌 **Активовано режим: БАЗА (Oracle ERP)**\n\n' +
          'Тепер Ви можете запитувати інформацію про договори, фірми, заявки на перевезення, претензії, контакти чи працівників.'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (text === '💡 Приклади запитів') {
      const examples = 
        '💡 **Приклади запитів для ШІ-Агента:**\n\n' +
        '🟢 **Для Тендерної платформи (Postgres):**\n' +
        '• *"Покажи останні 5 тендерів"*\n' +
        '• *"Скільки всього компаній зареєстровано в системі?"*\n' +
        '• *"Знайди контакти менеджера компанії Евротек"*\n\n' +
        '🔴 **Для БАЗИ (Oracle):**\n' +
        '• *"Знайди договір з номером 123"*\n' +
        '• *"Покажи останні заявки на перевезення вантажу буряк"*\n' +
        '• *"Які претензії зареєстровані за останній місяць?"*';
      await ctx.reply(markdownToHtml(examples), { parse_mode: 'HTML' });
      return;
    }

    if (text === '📋 Доступні таблиці') {
      const tablesInfo = 
        '📋 **У системі доступна інформація про:**\n\n' +
        '🟢 **База даних PostgreSQL (Портал тендерів):**\n' +
        '• **Компанії (company):** Назва, EDRPOU, тип (клієнт/перевізник), блокування, чорний список.\n' +
        '• **Співробітники (person):** Прізвище, ім\'я, email, посада, компанія.\n' +
        '• **Транспорт (vehicle):** Номери авто, типи причепів/кузовів.\n' +
        '• **Тендери (tender, tender_lst):** Вантажі, об\'єми, вага, ціни, міста, країни, статуси.\n' +
        '• **Пропозиції та Переможці (tender_rate, tender_winner):** Ставки перевізників.\n\n' +
        '🔴 **База даних Oracle (ERP / Контракти / Фінанси):**\n' +
        '• **Фірми (FIRMA):** Перелік наших внутрішніх юридичних осіб.\n' +
        '• **Договори (DOG):** Номери, дати, зміст та термін дії договорів.\n' +
        '• **Заявки (ZAY):** Документи на перевезення, суми замовників та перевізників, вантажі, авто, водії, телефони, маршрути.\n' +
        '• **Претензії (PRET):** Номери претензій, суми, примітки.\n' +
        '• **Контакти (KONTAKT):** Телефонний довідник клієнтів та перевізників.\n' +
        '• **Співробітники (OS):** Довідник наших штатних працівників.';
      await ctx.reply(markdownToHtml(tablesInfo), { parse_mode: 'HTML' });
      return;
    }

    if (!text && !voiceFileId) {
      await ctx.reply('❓ Надішліть, будь ласка, текстове або голосове повідомлення.');
      return;
    }

    const aiMode = session.ai_mode;
    if (!aiMode) {
      await ctx.reply(
        markdownToHtml(
          '⚠️ **Будь ласка, спочатку оберіть базу даних для запиту!**\n\n' +
          'Використовуйте кнопки під клавіатурою:\n' +
          '• **🟢 Тендерна платформа** (PostgreSQL)\n' +
          '• **🔴 БАЗА** (Oracle ERP)'
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    await this.runAiQueryAndReply(ctx, {
      text,
      voiceFileId,
      aiMode,
      statusText: `⏳ **Обробляю ваш запит до ${aiMode === 'oracle' ? 'БАЗИ' : 'Тендерної платформи'}...**`,
      exitButtonText: '🚪 Вийти з ШІ-Агента',
    });
  }

  /** Повідомлення в режимі звітів по тендерах (scene === 'report'). */
  private async handleReportMessage(ctx: Context, text?: string, voiceFileId?: string) {
    if (text === REPORT_EXIT_BUTTON) {
      await this.exitAiScene(ctx);
      return;
    }

    if (text === REPORT_EXAMPLES_BUTTON) {
      const examples =
        '💡 **Приклади звітів:**\n\n' +
        '• *"Скільки тендерів виставив кожен відділ за останній місяць?"*\n' +
        '• *"Який відділ отримав найбільше ставок перевізників за тиждень?"*\n' +
        '• *"Покажи закриті тендери відділу перевезень по Україні за липень"*\n' +
        '• *"Чи була активність по тендерах Вінницького відділення за останні 14 днів?"*\n' +
        '• *"Середня стартова ціна тендерів по відділах за квартал"*';
      await ctx.reply(markdownToHtml(examples), { parse_mode: 'HTML' });
      return;
    }

    // Кнопка швидкого звіту підміняється готовим запитанням для ШІ
    const question = (text && REPORT_QUICK_QUESTIONS[text]) || text;

    if (!question && !voiceFileId) {
      await ctx.reply('❓ Опишіть потрібний звіт текстом або голосовим повідомленням.');
      return;
    }

    await this.runAiQueryAndReply(ctx, {
      text: question,
      voiceFileId,
      aiMode: 'postgres',
      reportMode: true,
      statusText: '⏳ **Готую звіт, це може зайняти до хвилини...**',
      exitButtonText: REPORT_EXIT_BUTTON,
    });
  }

  /**
   * Виконує ШІ-запит у фоні й надсилає відповідь частинами до 4000 символів.
   * Fire-and-forget: Telegraf-webhook має відповісти одразу, інакше таймаут 90s.
   */
  private async runAiQueryAndReply(
    ctx: Context,
    opts: {
      text?: string;
      voiceFileId?: string;
      aiMode: 'postgres' | 'oracle';
      reportMode?: boolean;
      statusText: string;
      exitButtonText: string;
    },
  ) {
    const telegramId = ctx.from!.id;
    const statusMsg = await ctx.reply(markdownToHtml(opts.statusText), { parse_mode: 'HTML' });
    const chatId = ctx.chat!.id;
    const statusMsgId = statusMsg.message_id;
    const exitKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback(opts.exitButtonText, 'exit_ai')],
    ]);

    void (async () => {
      try {
        await ctx.sendChatAction('typing');
        const response = await this.telegramService.handleAiQuery(
          telegramId,
          opts.text,
          opts.voiceFileId,
          opts.aiMode,
          opts.reportMode ?? false,
        );

        // Split response into chunks under 4000 characters
        const maxLength = 4000;
        const chunks: string[] = [];
        if (response.length > maxLength) {
          const lines = response.split('\n');
          let currentChunk = '';
          for (const line of lines) {
            if (currentChunk.length + line.length + 1 > maxLength) {
              if (currentChunk.trim()) chunks.push(currentChunk);
              currentChunk = line;
            } else {
              currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
            }
          }
          if (currentChunk.trim()) chunks.push(currentChunk);
        } else {
          chunks.push(response);
        }

        // Edit the first status message with the first chunk
        await ctx.telegram.editMessageText(
          chatId,
          statusMsgId,
          undefined,
          markdownToHtml(chunks[0]),
          {
            parse_mode: 'HTML',
            ...exitKeyboard,
          }
        );

        // Send the remaining chunks
        for (let i = 1; i < chunks.length; i++) {
          await ctx.telegram.sendMessage(chatId, markdownToHtml(chunks[i]), {
            parse_mode: 'HTML',
            ...exitKeyboard,
          });
        }
      } catch (error) {
        console.error('Error handling AI/report query:', error);
        try {
          await ctx.telegram.editMessageText(
            chatId,
            statusMsgId,
            undefined,
            '❌ Сталася помилка при обробці запиту. Спробуйте пізніше.'
          );
        } catch (editErr) {
          await ctx.telegram.sendMessage(chatId, '❌ Сталася помилка при обробці запиту. Спробуйте пізніше.');
        }
      }
    })();
  }
}

function escapeHtml(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Коротке ім'я відправника: до "<" або до "@". */
function shortSender(from: string): string {
  if (!from) return '—';
  const beforeBracket = from.split('<')[0].trim();
  const base = beforeBracket || from;
  return (base.split('@')[0] || base).trim().slice(0, 40);
}

/** Ключ групування листів одного відправника: адреса, без неї — ім'я. */
function senderKey(it: UnreadDigestItem): string {
  return (it.fromAddress || shortSender(it.from)).toLowerCase().trim();
}

/** 1 лист, 2-4 листи, 5+ листів. */
function mailCountWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} лист`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} листи`;
  return `${n} листів`;
}

/**
 * Компактний дайджест непрочитаних листів.
 *
 * Правило: адекватні (робочі) листи показуються з суттю, поділені за важливістю.
 * Спам/розсилки (Logist Pro тощо) та підозрілі листи текстом НЕ виводяться —
 * лише відправник і кількість, із позначкою 🚫 спам чи ⚠️ небезпечно.
 * Додатково згортаються часті відправники: 2+ неважливі листи від одного
 * відправника — теж у зведений рядок, навіть якщо ШІ не назвав їх спамом.
 */
function formatUnreadDigest(items: UnreadDigestItem[]): string {
  if (!items.length) {
    return '✅ Непрочитаних листів немає.';
  }

  const senderCounts = new Map<string, number>();
  for (const it of items) {
    const key = senderKey(it);
    senderCounts.set(key, (senderCounts.get(key) || 0) + 1);
  }

  const isCollapsed = (it: UnreadDigestItem) =>
    it.isSpam ||
    it.isSuspicious ||
    (it.importance === 'low' && (senderCounts.get(senderKey(it)) || 0) >= 2);

  const normal = items.filter((i) => !isCollapsed(i));
  const collapsed = items.filter(isCollapsed);

  const lines: string[] = [`📬 <b>Непрочитані листи:</b> ${items.length}`];

  const groups: { key: UnreadDigestItem['importance']; title: string }[] = [
    { key: 'high', title: '🔴 <b>ВАЖЛИВІ</b>' },
    { key: 'medium', title: '🟡 <b>СЕРЕДНІ</b>' },
    { key: 'low', title: '⚪️ <b>НЕВАЖЛИВІ</b>' },
  ];

  for (const g of groups) {
    const inGroup = normal.filter((i) => i.importance === g.key);
    if (!inGroup.length) continue;

    lines.push('', `${g.title} (${inGroup.length})`);
    for (const it of inGroup) {
      const cat = it.category && it.category !== '—' ? `[${escapeHtml(it.category)}] ` : '';
      const sender = escapeHtml(shortSender(it.from));
      const essence = escapeHtml(it.essence);
      lines.push(`• ${cat}<b>${sender}</b> — ${essence}`);
    }
  }

  if (collapsed.length) {
    // Зводимо по відправнику: кількість + найгірша позначка серед його листів
    const bySender = new Map<
      string,
      { name: string; count: number; suspicious: boolean }
    >();
    for (const it of collapsed) {
      const key = senderKey(it);
      const rec = bySender.get(key) || {
        name: shortSender(it.from),
        count: 0,
        suspicious: false,
      };
      rec.count += 1;
      rec.suspicious = rec.suspicious || it.isSuspicious;
      bySender.set(key, rec);
    }

    lines.push('', `🚫 <b>СПАМ / РОЗСИЛКИ</b> (${collapsed.length})`);
    const sorted = [...bySender.values()].sort(
      (a, b) => Number(b.suspicious) - Number(a.suspicious) || b.count - a.count,
    );
    for (const s of sorted) {
      const danger = s.suspicious ? ' ⚠️ <b>схоже на фішинг — не відкривати</b>' : '';
      lines.push(`• <b>${escapeHtml(s.name)}</b> — ${mailCountWord(s.count)}${danger}`);
    }
  }

  let text = lines.join('\n');
  if (text.length > 3900) text = text.slice(0, 3900) + '\n…';
  return text;
}

function markdownToHtml(text: string): string {
  // 1. Escape HTML special characters first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Convert preformatted code blocks: ```code``` -> <pre>code</pre>
  html = html.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');

  // 3. Convert inline code: `code` -> <code>code</code>
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 4. Convert bold: **bold** or *bold* -> <b>bold</b>
  html = html.replace(/\*\*([^\*]+)\*\*/g, '<b>$1</b>');
  html = html.replace(/(?<!^\s*)\*([^\*\n]+)\*/gm, '<b>$1</b>');

  // 5. Replace list bullets: * item or - item at start of lines with •
  html = html.replace(/^\s*[\*\-]\s+/gm, '• ');

  return html;
}



