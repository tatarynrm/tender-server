// src/telegram-token.controller.ts
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UserService } from 'src/user/user.service';
import { TelegramTokenService } from './telegram-token.service';

@Controller('telegram-token')
export class TelegramTokenController {
  constructor(
    private readonly userService: UserService,
    private readonly telegramTokenService: TelegramTokenService,
  ) {}

  @Get('link')
  async generateToken(@Req() req: Request) {
    const userId = req.session.userId; // отримуємо id користувача з JWT або сесії
    const token = await this.userService.generateTelegramToken(userId);
    return { token };
  }

  @Post('get-token')
  async createOrUpdateTelegramConnectToken(
    @Req() req: Request,
    @Body() dto: { email: string },
  ) {
    console.log(dto.email, 'email');

    return this.telegramTokenService.createOrUpdateTelegramConnectToken(
      dto.email,
    );
  }
  @Post('disconnect')
  async disconnectTelegram(
    @Req() req: Request,
    @Body() dto: { telegram_id: number },
  ) {
    console.log(dto, 'DTO');

    return this.telegramTokenService.disconnectTelegram(dto.telegram_id);
  }
}
