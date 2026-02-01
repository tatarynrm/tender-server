import { Controller, Post, Req, Res } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';

@Controller('telegram') // Це відповідає частині /telegram/ в URL
export class TelegramController {
  constructor(@InjectBot() private readonly bot: Telegraf<Context>) {}

  @Post('telegram-webhook') // Це відповідає частині /telegram-webhook
  async handleWebhook(@Req() req: any, @Res() res: any) {
    try {
      // Цей метод передає дані в @Update() (ваші @Start, @Hears)
      await this.bot.handleUpdate(req.body, res);
    } catch (e) {
      console.error('Помилка обробки запиту Telegram:', e);
      res.status(200).send('OK');
    }
  }
}