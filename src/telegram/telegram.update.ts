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

@Update()
export class TelegramUpdate {
  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly telegramService: TelegramService,
    private readonly userGateway: UserGateway,
    private readonly mailReaderService: MailReaderService,
    private readonly approvalService: ApprovalService,
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

      const user = await this.telegramService.checkIfUserExist(telegramId);
      if (!user) {
        const unregistered = MESSAGES.UNREGISTERED_USER(process.env.ALLOWED_ORIGIN!);
        await ctx.reply(unregistered.text, unregistered.options);
        return;
      }

      const hasAiAccess = await this.telegramService.checkUserHasAiAccess(telegramId);
      const isAdmin = this.telegramService.isAdmin(telegramId);

      const inlineButtons: any[] = [];
      if (isAdmin) {

        inlineButtons.push([Markup.button.callback('📬 Непрочитані листи', 'check_unread_mail')]);
        inlineButtons.push([Markup.button.callback('🚀 Запустити DEPLOY', 'run_deploy')]);
        inlineButtons.push([Markup.button.callback('📊 Статистика', 'get_stats')]);
      }
      // ШІ-кнопка тимчасово відключена
      // if (hasAiAccess) {
      //   inlineButtons.push([Markup.button.callback('🤖 ШІ-Агент', 'enter_ai')]);
      // }

      if (inlineButtons.length > 0) {
        await ctx.reply(
          markdownToHtml('👑 **Вітаємо!**\n\nВи маєте доступ до спеціальних функцій бота.'),
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard(inlineButtons)
          }
        );
        return;
      }

      await ctx.reply('👋 Ласкаво просимо! Ви підключені до системи сповіщень ICT Tender.', Markup.removeKeyboard());
    } catch (err) {
      console.error(err);
      await ctx.reply('Сталася помилка, спробуйте пізніше.');
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


  @Action('get_stats')
  async handleStats(ctx: Context) {
    const stats = await this.telegramService.getSubscriberStats();
    await ctx.answerCbQuery();
    await ctx.reply(
      `📊 *Статистика бота:*\n\n` +
      `👥 Всього підписників: *${stats.total}*\n` +
      `🏢 Менеджери ICT: *${stats.ict_count}*\n` +
      `🚚 Перевізники: *${stats.carrier_count}*`,
      { parse_mode: 'Markdown' }
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
  async infoCommand(ctx: Context) {
    await ctx.reply(
      markdownToHtml(
        'ℹ️ **Про бота**\n\n' +
        'На даному етапі цей бот буде використовуватись для надсилання сповіщень про тендери та важливі події.\n\n' +
        '🚀 У подальшому тут з’явиться багато корисних функцій для керування вашими заявками та документами прямо з Telegram!'
      ),
      { parse_mode: 'HTML' }
    );
  }

  @Command('ai')
  @Action('enter_ai')
  async enterAiScene(ctx: Context) {
    // ШІ-Агент тимчасово недоступний
    if ((ctx as any).callbackQuery) await ctx.answerCbQuery();
    return ctx.reply('⛔️ ШІ-Агент тимчасово недоступний. Спробуйте пізніше.');
  }

  @Command('exit')
  @Action('exit_ai')
  async exitAiScene(ctx: Context) {
    if ((ctx as any).session) {
      (ctx as any).session.scene = undefined;
    }
    await ctx.reply('🚪 Ви вийшли з режиму ШІ-Агента. Повертаємось до звичайного режиму.', Markup.removeKeyboard());
  }

  @On('message')
  async handleAllMessages(ctx: Context) {
    const session = (ctx as any).session;
    if (!session || session.scene !== 'ai') {
      // If not in AI scene, do nothing (pass it through)
      return;
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const message: any = ctx.message;
    const text = message?.text;
    const voiceFileId = message?.voice?.file_id;

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

    const statusMsg = await ctx.reply(markdownToHtml(`⏳ **Обробляю ваш запит до ${aiMode === 'oracle' ? 'БАЗИ' : 'Тендерної платформи'}...**`), { parse_mode: 'HTML' });

    const chatId = ctx.chat!.id;
    const statusMsgId = statusMsg.message_id;

    // Fire-and-forget: виконуємо AI-запит у фоні, щоб Telegraf webhook повернувся одразу
    // і не отримав таймаут 90s. Результат надсилаємо через bot.telegram асинхронно.
    void (async () => {
      try {
        await ctx.sendChatAction('typing');
        const response = await this.telegramService.handleAiQuery(telegramId, text, voiceFileId, aiMode);

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
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🚪 Вийти з ШІ-Агента', 'exit_ai')]
            ])
          }
        );

        // Send the remaining chunks
        for (let i = 1; i < chunks.length; i++) {
          await ctx.telegram.sendMessage(chatId, markdownToHtml(chunks[i]), {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🚪 Вийти з ШІ-Агента', 'exit_ai')]
            ])
          });
        }
      } catch (error) {
        console.error('Error handling message in AI scene:', error);
        try {
          await ctx.telegram.editMessageText(
            chatId,
            statusMsgId,
            undefined,
            '❌ Сталася помилка при обробці запиту ШІ. Спробуйте пізніше.'
          );
        } catch (editErr) {
          await ctx.telegram.sendMessage(chatId, '❌ Сталася помилка при обробці запиту ШІ. Спробуйте пізніше.');
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

/** Компактний дайджест непрочитаних листів, поділений за важливістю. */
function formatUnreadDigest(items: UnreadDigestItem[]): string {
  if (!items.length) {
    return '✅ Непрочитаних листів немає.';
  }

  const groups: { key: UnreadDigestItem['importance']; title: string }[] = [
    { key: 'high', title: '🔴 <b>ВАЖЛИВІ</b>' },
    { key: 'medium', title: '🟡 <b>СЕРЕДНІ</b>' },
    { key: 'low', title: '⚪️ <b>НЕВАЖЛИВІ</b>' },
  ];

  const lines: string[] = [`📬 <b>Непрочитані листи:</b> ${items.length}`];

  for (const g of groups) {
    const inGroup = items.filter((i) => i.importance === g.key);
    if (!inGroup.length) continue;

    lines.push('', `${g.title} (${inGroup.length})`);
    for (const it of inGroup) {
      const cat = it.category && it.category !== '—' ? `[${escapeHtml(it.category)}] ` : '';
      const sender = escapeHtml(shortSender(it.from));
      const essence = escapeHtml(it.essence);
      lines.push(`• ${cat}<b>${sender}</b> — ${essence}`);
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



