import { Action, Command, Hears, InjectBot, Start, Update } from 'nestjs-telegraf';
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

      const isAdmin = this.telegramService.isAdmin(telegramId);

      if (isAdmin) {
        await ctx.reply(
          '👑 *Вітаємо, Адміністраторе!*\n\nВи маєте доступ до панелі керування сервером.',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('🚀 Запустити DEPLOY', 'run_deploy')],
              [Markup.button.callback('📊 Статистика', 'get_stats')]
            ])
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

    await ctx.reply('⏳ *Починаю процес деплою...*', { parse_mode: 'Markdown' });

    const result = await this.telegramService.runDeploy();

    if (result.success) {
      await ctx.reply('✅ *Деплой завершено успішно!*\n\n' + '```\n' + result.output.slice(0, 1000) + '\n```', { parse_mode: 'Markdown' });
    } else {
      await ctx.reply('❌ *Помилка під час деплою:*\n\n' + '```\n' + result.output.slice(0, 1000) + '\n```', { parse_mode: 'Markdown' });
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
      'ℹ️ *Про бота*\n\n' +
      'На даному етапі цей бот буде використовуватись для надсилання сповіщень про тендери та важливі події.\n\n' +
      '🚀 У подальшому тут з’явиться багато корисних функцій для керування вашими заявками та документами прямо з Telegram!',
      { parse_mode: 'Markdown' }
    );
  }
}
