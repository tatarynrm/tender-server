import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SystemGateway } from './systems.gateway';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class SystemsService {
  private activeMeeting: { id: string; startedAt: Date; url?: string; audienceType?: string; targetIds?: number[] } | null = null;

  constructor(
    private readonly systemGateway: SystemGateway,
    private readonly telegramService: TelegramService
  ) {}

  startMeeting(url?: string, audienceType: 'all' | 'heads' | 'selective' = 'all', targetIds: number[] = []) {
    if (this.activeMeeting) {
      return this.activeMeeting; // Вже йде нарада
    }

    this.activeMeeting = {
      id: uuidv4(),
      startedAt: new Date(),
      url: url || '',
      audienceType,
      targetIds,
    };

    // Розсилаємо всім онлайн користувачам
    this.systemGateway.emitCommand('MEETING_STARTED', this.activeMeeting);

    // Відправляємо фото та лінк у Telegram
    if (this.activeMeeting.url) {
      this.telegramService.sendMeetingNotification({
        url: this.activeMeeting.url,
        audienceType: this.activeMeeting.audienceType as any,
        targetIds: this.activeMeeting.targetIds,
      }).catch(err => console.error("Failed to send TG meeting notification", err));
    }

    return this.activeMeeting;
  }

  stopMeeting() {
    this.activeMeeting = null;
    this.systemGateway.emitCommand('MEETING_STOPPED', {});
    return { success: true };
  }

  getActiveMeeting() {
    return this.activeMeeting;
  }
}
