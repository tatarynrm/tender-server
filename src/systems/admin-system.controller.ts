// src/systems/admin-system.controller.ts
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SystemGateway } from './systems.gateaway';


@Controller('admin/system')
// @UseGuards(RolesGuard) // Не забудьте захистити цей роут!
export class AdminSystemController {
  constructor(private readonly systemGateway: SystemGateway) {}

  @Post('send-command')
  async sendCommand(
    @Body() dto: { 
      type: 'FORCE_RELOAD' | 'FORCE_LOGOUT' | 'SHOW_NOTIFICATION' | 'UPDATE_CARGO_PRICE';
      payload?: any;
      userId?: string; // якщо пустий — команда йде всім
    }
  ) {

    console.log('som,ething');
    
    this.systemGateway.emitCommand(dto.type, dto.payload, dto.userId);
    return { success: true, sentTo: dto.userId || 'ALL' };
  }
}