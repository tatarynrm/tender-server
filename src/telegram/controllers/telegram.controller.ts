import { Controller, Post, Req, Res, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';

@Controller('telegram') 
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(@InjectBot() private readonly bot: Telegraf<Context>) {}

  @Post('webhook') 
  async handleWebhook(@Req() req: any, @Res() res: any) {
    try {
      // Передаємо POST запит від Telegram у внутрішню екосистему @Update()
      await this.bot.handleUpdate(req.body, res);
    } catch (e) {
      this.logger.error('Помилка обробки вебхука:', e);
      // Завжди повертаємо 200 OK, інакше Telegram буде спамити повторними запитами
      res.status(200).send('OK'); 
    }
  }
}