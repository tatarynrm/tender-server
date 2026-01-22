import { Controller, Post, Body } from '@nestjs/common';
import { SocketService } from './socket.service';

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