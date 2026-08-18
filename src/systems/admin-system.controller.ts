import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SystemGateway } from './systems.gateway';
import { SystemsService } from './systems.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { IctAdminGuard } from 'src/libs/common/guards/ict-admin.guard';

// send-command розсилає FORCE_RELOAD/FORCE_LOGOUT усім сокетам — лише для
// авторизованих адмінів ICT.
@UseGuards(AuthGuard, IctAdminGuard)
@Controller('admin/system')
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
  startMeeting(@Body() dto: { url?: string, audienceType?: 'all' | 'heads' | 'selective', targetIds?: number[] }) {
    return this.systemsService.startMeeting(dto?.url, dto?.audienceType, dto?.targetIds);
  }

  @Post('meeting/stop')
  stopMeeting() {
    return this.systemsService.stopMeeting();
  }
}