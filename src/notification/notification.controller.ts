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

  @Get('getNotificationRate')
  async getNotificationRateSettings() {
    return this.notificationService.getNotificationRateSettings();
  }

  @Post('updateNotificationRate')
  async updateNotificationRateSettings(@Body() body: any) {
    return this.notificationService.updateNotificationRateSettings(body);
  }

  // Дзвіночок: список сповіщень поточного користувача.
  @Get('user-notifications')
  async getUserNotifications() {
    return this.notificationService.getUserNotifications();
  }

  @Post('seen')
  async markNotificationSeen(@Body() body: { id: number }) {
    return this.notificationService.markNotificationSeen(body?.id);
  }

  @Post('seen-all')
  async markAllNotificationsSeen() {
    return this.notificationService.markAllNotificationsSeen();
  }
}

// notification
