import { Action, Hears, InjectBot, Start, Update } from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';
import { TelegramService } from './telegram.service';
import {
  DEFAULT_KEYBOARD,
  PREMIUM_KEYBOARD,
} from './common/telegram.keyboards';
import { BUTTON_NAMES } from './common/telegra.buttons-text';
import { MESSAGES } from './common/telegram.messages';

@Update()
export class TelegramUpdate {
  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly telegramService: TelegramService,
  ) {}

  @Start()
  async startCommand(ctx: Context) {
    try {
      const telegramId = ctx.from?.id;
      if (!telegramId) return ctx.reply('Не вдалося отримати ваш ID');

      // Telegraf автоматично парсить посилання типу t.me/bot?start=TOKEN
      const token = (ctx as any).payload; 

      console.log(`--- NEW POLLING REQUEST --- ID: ${telegramId}, Token: ${token}`);

      if (token) {
        const user = await this.telegramService.findByTelegramToken(token);
        if (user) {
          await this.telegramService.updateTelegramId(
            user.id,
            telegramId,
            ctx.from.username ?? '',
            ctx.from.first_name ?? '',
          );
          return ctx.reply('✅ Telegram успішно підключено!', PREMIUM_KEYBOARD);
        } else {
          return ctx.reply('❌ Токен не знайдено або він вже використаний.');
        }
      }

      const user = await this.telegramService.checkIfUserExist(telegramId);
      if (!user) {
        return ctx.reply(MESSAGES.UNREGISTERED_USER(process.env.ALLOWED_ORIGIN!).text);
      }

      const keyboard = user.isPremium ? PREMIUM_KEYBOARD : DEFAULT_KEYBOARD;
      await ctx.reply('Виберіть опцію:', keyboard);

    } catch (err) {
      console.error(err);
      await ctx.reply('Сталася помилка, спробуйте пізніше.');
    }
  }

  @Hears(BUTTON_NAMES.MY_TRANSPORTATIONS)
  async getMyTransportations(ctx: Context) {
    await ctx.reply('Список справ');
  }
}
