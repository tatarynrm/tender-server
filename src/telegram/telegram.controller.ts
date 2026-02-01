import { Controller, Post, Req, Res } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import type { Request, Response } from 'express';
import { InjectBot } from 'nestjs-telegraf';

@Controller('telegram')
export class TelegramController {
  constructor(@InjectBot() private readonly bot: Telegraf<any>) {}

  @Post('telegram-webhook')
  async handleUpdate(@Req() req: Request, @Res() res: Response) {
    try {
      console.log('Update received:', req.body);
      await this.bot.handleUpdate(req.body, res);
      res.status(200).send('OK');
    } catch (err) {
      console.error(err);
      res.status(500).send('Error');
      
    }
  }
}

// ТЕСТОВІ ДАНІ ДЛЯ ВИДАЛЕННЯ ТА ВСТАНОВЛЕННЯ ХУКА
// https://api.telegram.org/bot8486803623:AAG0HdTL6YdCFjUsLhZvc7lz6CFz8Ouoi9Y/deleteWebhook
// https://api.telegram.org/bot8486803623:AAG0HdTL6YdCFjUsLhZvc7lz6CFz8Ouoi9Y/setWebhook?url=https://d77cd2bc0f20f20.ngrok-free.app/telegram/telegram-webhook
