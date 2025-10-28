// src/telegram-token.controller.ts
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UserService } from 'src/user/user.service';

@Controller('telegram-token')
export class TelegramTokenController {
  constructor(private readonly userService: UserService) {}

  @Get('link')
  async generateToken(@Req() req: Request) {
    const userId = req.session.userId; // отримуємо id користувача з JWT або сесії
    const token = await this.userService.generateTelegramToken(userId);
    return { token };
  }
}
