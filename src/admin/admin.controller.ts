import { Controller, Post, Param, Body, Get } from '@nestjs/common';
import { LoadGateway } from 'src/crm/load/load.gateway';
import { UserService } from 'src/user/user.service';
import { TelegramService } from 'src/telegram/telegram.service';

@Controller()
export class AdminController {
  constructor(
    private readonly usersService: UserService,
    private readonly loadGateway: LoadGateway,
    private readonly telegramService: TelegramService,
  ) { }

  @Post('block/:id')
  async blockUser(@Param('id') id: string) {
    const userId = Number(id);
    await this.usersService.blockUser(userId);
    return { status: 'ok', message: `User ${userId} blocked` };
  }

  @Post('notification')
  async sendNotification(@Body() body: { message: string, type: 'warning' | 'advice' | 'request' }) {
    this.loadGateway.sendAdminNotification(body);
    return { status: 'ok', message: 'Notification sent to all managers' };
  }

  @Get('telegram-stats')
  async getTelegramStats() {
    return this.telegramService.getSubscriberStats();
  }

  @Post('telegram-broadcast')
  async broadcastTelegram(@Body() body: { 
    message: string, 
    filter?: { companyIds?: number[], onlyICT?: boolean } 
  }) {
    return this.telegramService.broadcastMessage(body);
  }

  @Get('telegram-users')
  async getTelegramUsers() {
    return this.telegramService.getTelegramUsers();
  }
}


