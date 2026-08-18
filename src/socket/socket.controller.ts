import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SocketService } from './socket.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { IctAdminGuard } from 'src/libs/common/guards/ict-admin.guard';

// Розсилка нотифікацій довільним userId — закриваємо для анонімів (лише адмін ICT).
@UseGuards(AuthGuard, IctAdminGuard)
@Controller('test-socket')
export class SocketController {
  constructor(private readonly socketService: SocketService) {}

  @Post('send')
  async sendMessage(
    @Body() body: { userIds: string | string[]; message: string },
  ) {
    return this.socketService.sendNotification(body.userIds, body.message);
  }
}