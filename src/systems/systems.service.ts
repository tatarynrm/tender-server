import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SystemGateway } from './systems.gateway';

@Injectable()
export class SystemsService {
  private activeMeeting: { id: string; startedAt: Date; url?: string; audienceType?: string; targetIds?: number[] } | null = null;

  constructor(private readonly systemGateway: SystemGateway) {}

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
