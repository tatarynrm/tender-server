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
      const telegramId = ctx.message?.from?.id;
      if (!telegramId) return ctx.reply('Не вдалося отримати ваш ID');

      const token = (ctx as any).payload as string | undefined; // <-- тут

      if (token) {
        const user = await this.telegramService.findByTelegramToken(token);

        if (user) {
          await this.telegramService.updateTelegramId(
            user.id,
            telegramId,
            ctx.message.from.username ?? '',
            ctx.message.from.first_name ?? '',
          );

          await this.telegramService.deleteTelegramToken(token);

          ctx.reply('✅ Telegram успішно підключено!', PREMIUM_KEYBOARD);
          return;
        } else {
          ctx.reply('❌ Токен не знайдено або він вже використаний.');
          return;
        }
      }

      const user = await this.telegramService.checkIfUserExist(telegramId);
      console.log(user, 'USER');

      if (!user) {
        const msg = MESSAGES.UNREGISTERED_USER(process.env.ALLOWED_ORIGIN!);

        ctx.reply(msg.text);
        return;
      }

      const keyboard = user.isPremium ? PREMIUM_KEYBOARD : DEFAULT_KEYBOARD;
      await ctx.reply('Виберіть опцію:', keyboard);
    } catch (err) {
      await ctx.reply('Сталася помилка, спробуйте пізніше.');
    }
  }

  @Hears(BUTTON_NAMES.MY_TRANSPORTATIONS)
  async getMyTransportations(ctx: Context) {
    await ctx.reply('Список справ');
  }
}
