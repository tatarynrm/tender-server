import { Action, Command, Hears, InjectBot, Start, Update } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
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

          await ctx.reply('✅ Telegram успішно підключено!');
          return;
        } else {
          await ctx.reply('❌ Токен не знайдено або він вже використаний.');
          return;
        }
      }

      const user = await this.telegramService.checkIfUserExist(telegramId);
      if (!user) {
        await ctx.reply(
          MESSAGES.UNREGISTERED_USER(process.env.ALLOWED_ORIGIN!).text,
        );
        return;
      }

      await ctx.reply('👋 Ласкаво просимо! Ви підключені до системи сповіщень ICT Tender. Використовуйте меню для навігації.');
    } catch (err) {
      console.error(err);
      await ctx.reply('Сталася помилка, спробуйте пізніше.');
    }
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
