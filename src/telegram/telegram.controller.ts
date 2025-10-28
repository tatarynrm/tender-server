// src/telegram/telegram.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { TelegramService } from './telegram.service';

interface SendMessageDto {
  telegramid: string | number; // або масив telegramId для масової розсилки
  message: string;
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('send-message')
  async sendMessage(@Body() body: SendMessageDto) {
    const { telegramid, message } = body;

    // Надсилаємо повідомлення через HTTP API твого Telegraf бота
    return this.telegramService.sendMessage(telegramid, message);
  }
}
