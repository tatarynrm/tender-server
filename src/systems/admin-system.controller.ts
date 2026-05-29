import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SystemGateway } from './systems.gateway';
import { SystemsService } from './systems.service';

@Controller('admin/system')
// @UseGuards(RolesGuard) // Не забудьте захистити цей роут!
export class AdminSystemController {
  constructor(
    private readonly systemGateway: SystemGateway,
    private readonly systemsService: SystemsService
  ) {}

  @Post('send-command')
  async sendCommand(
    @Body() dto: { 
      type: 'FORCE_RELOAD' | 'FORCE_LOGOUT' | 'SHOW_NOTIFICATION' | 'UPDATE_CARGO_PRICE';
      payload?: any;
      userId?: string; // якщо пустий — команда йде всім
    }
  ) {
    this.systemGateway.emitCommand(dto.type, dto.payload, dto.userId);
    return { success: true, sentTo: dto.userId || 'ALL' };
  }

  @Post('meeting/start')
  startMeeting() {
    return this.systemsService.startMeeting();
  }

  @Post('meeting/stop')
  stopMeeting() {
    return this.systemsService.stopMeeting();
  }
}