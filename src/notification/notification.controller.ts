import { Body, Controller, Get, Post } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Authorization()
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('getNotification')
  async getNotificationSettings() {
    return this.notificationService.getNotificationSettings();
  }

  @Post('updateNotification')
  async updateNotificationSettings(@Body() body: any) {
    return this.notificationService.updateNotificationSettings(body);
  }

  @Get('form-data')
  async getFormData() {
    return this.notificationService.getFormData();
  }
}

// notification
