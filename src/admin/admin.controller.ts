import { Controller, Post, Param, Body } from '@nestjs/common';
import { LoadGateway } from 'src/crm/load/load.gateway';
import { UserService } from 'src/user/user.service';

@Controller()
export class AdminController {
  constructor(
    private readonly usersService: UserService,
    private readonly loadGateway: LoadGateway,
  ) { }

  @Post('block/:id')
  async blockUser(@Param('id') id: string) {
    const userId = Number(id);
    await this.usersService.blockUser(userId);
    return { status: 'ok', message: `User ${userId} blocked` };
  }

  @Post('notification')
  async sendNotification(@Body() body: { message: string, type: 'warning' | 'advice' | 'request' }) {
    this.loadGateway.sendAdminNotification(body);
    return { status: 'ok', message: 'Notification sent to all managers' };
  }
}


