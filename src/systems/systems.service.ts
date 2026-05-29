import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SystemGateway } from './systems.gateway';

@Injectable()
export class SystemsService {
  private activeMeeting: { id: string; startedAt: Date } | null = null;

  constructor(private readonly systemGateway: SystemGateway) {}

  startMeeting() {
    if (this.activeMeeting) {
      return this.activeMeeting; // Вже йде нарада
    }

    this.activeMeeting = {
      id: uuidv4(),
      startedAt: new Date(),
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
