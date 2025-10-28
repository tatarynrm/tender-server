// src/telegram/telegram.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TelegramService {
  constructor() {}

  async sendMessage(telegramid: string | number, message: string) {
    const url = process.env.TELEGRAM_SERVER_URL!; // наприклад: http://localhost:4001
    const body = { telegramid, message };

    console.log(body, 'BODY');

    try {
      const { data } = await axios.post(`${url}/send-message`, body);
      console.log(data, 'RESPONSE');

      if (data.ok) {
        return data;
      } else {
        // сервер відповів, але повідомлення не надіслано
        throw new HttpException(
          data.error || 'Telegram server returned error',
          HttpStatus.BAD_GATEWAY,
        );
      }
    } catch (error: any) {
      console.error('TelegramService error:', error.message || error);

      // якщо axios не зміг виконати запит (наприклад, сервер недоступний)
      throw new HttpException(
        'Failed to send message to Telegram server',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
