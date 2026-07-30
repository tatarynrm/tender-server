import { Action, Command, Hears, InjectBot, Start, Update, On } from 'nestjs-telegraf';
import { Context, Telegraf, Markup } from 'telegraf';
import { TelegramService } from './telegram.service';
import { MESSAGES } from './common/telegram.messages';
import { UserGateway } from 'src/user/user.gateway';

@Update()
export class TelegramUpdate {
  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly telegramService: TelegramService,
    private readonly userGateway: UserGateway,
  ) {}

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

        inlineButtons.push([Markup.button.callback('🚀 Запустити DEPLOY', 'run_deploy')]);
        inlineButtons.push([Markup.button.callback('📊 Статистика', 'get_stats')]);
      }
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

    const deployInfo = `
⏳ *Починаю процес деплою...*

*Що зараз відбудеться:*
1️⃣ *Перевірка оновлень (SERVER & CLIENT):* Бот завантажить останні зміни з GitHub (\`git stash\` та \`git pull\`).
2️⃣ *Збірка (Build):* Якщо є нові зміни, запуститься збірка (\`npm run build\`) для сервера та клієнта. Якщо змін немає, цей крок буде пропущено.
3️⃣ *Перезапуск (PM2):* Якщо код оновився, всі процеси будуть автоматично перезапущені (\`pm2 restart all\`).

Зачекайте, будь ласка. Це може зайняти кілька хвилин... 🚀
    `.trim();

    await ctx.reply(deployInfo, { parse_mode: 'Markdown' });

    const result = await this.telegramService.runDeploy();

    if (result.success) {
      await ctx.reply('✅ *Деплой завершено успішно!*\n\n📝 *Логи виконання:*\n' + '```\n' + result.output.slice(-2000) + '\n```', { parse_mode: 'Markdown' });
    } else {
      await ctx.reply('❌ *Помилка під час деплою:*\n\n' + '```\n' + result.output.slice(-2000) + '\n```', { parse_mode: 'Markdown' });
    }
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
    await ctx.reply('🤖 Функції ШІ-Агента тимчасово недоступні.');
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
        ctx.chat!.id,
        statusMsg.message_id,
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
        await ctx.reply(markdownToHtml(chunks[i]), {
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
          ctx.chat!.id,
          statusMsg.message_id,
          undefined,
          '❌ Сталася помилка при обробці запиту ШІ. Спробуйте пізніше.'
        );
      } catch (editErr) {
        await ctx.reply('❌ Сталася помилка при обробці запиту ШІ. Спробуйте пізніше.');
      }
    }
  }
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



