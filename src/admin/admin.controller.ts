import { Controller, Post, Param, Body, Get, Query, UseInterceptors, UploadedFile, UploadedFiles } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { LoadGateway } from 'src/crm/load/load.gateway';
import { UserService } from 'src/user/user.service';
import { TelegramService } from 'src/telegram/telegram.service';
import { MailingService } from './mailing.service';

@Controller()
export class AdminController {
  constructor(
    private readonly usersService: UserService,
    private readonly loadGateway: LoadGateway,
    private readonly telegramService: TelegramService,
    private readonly mailingService: MailingService,
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

  // --- EMAIL BROADCAST (MAILING) ENDPOINTS ---

  @Post('mailing/create')
  @UseInterceptors(FileInterceptor('file'))
  async createMailing(
    @Body('item_name') itemName: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.mailingService.createMailing(itemName, file.buffer);
  }

  @Get('mailing/list')
  async getMailingsList(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 10;
    return this.mailingService.getMailingsList(pageNum, limitNum, search || '');
  }

  @Get('mailing/:id')
  async getMailingDetails(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 50;
    return this.mailingService.getMailingDetails(Number(id), pageNum, limitNum, search || '');
  }

  @Post('mailing/:id/start')
  @UseInterceptors(FilesInterceptor('files'))
  async startMailing(
    @Param('id') id: string,
    @Body('emailTitle') emailTitle: string,
    @Body('emailContent') emailContent: string,
    @Body('templateId') templateId: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.mailingService.startMailing(
      Number(id),
      emailTitle,
      emailContent,
      templateId,
      files,
    );
  }

  @Post('mailing/:id/pause')
  async pauseMailing(@Param('id') id: string) {
    return this.mailingService.pauseMailing(Number(id));
  }
}
