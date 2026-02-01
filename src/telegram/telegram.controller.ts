import { Controller, Post, Req, Res } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';

@Controller('telegram')
export class TelegramController {
  constructor(@InjectBot() private readonly bot: Telegraf<Context>) {}

  @Post('telegram-webhook')
  async handleWebhook(@Req() req: any, @Res() res: any) {
    try {
      // Передаємо вхідне повідомлення від Telegram в логіку Telegraf (@Update)
      await this.bot.handleUpdate(req.body, res);
      // Важливо: res вже закривається методом handleUpdate, але можна підстрахуватися:
      if (!res.writableEnded) res.status(200).send();
    } catch (e) {
      console.error('Webhook Error:', e);
      res.status(200).send(); // Завжди 200 для Telegram, щоб він не повторював запит нескінченно
    }
  }
}