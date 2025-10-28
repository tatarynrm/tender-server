import { Controller, Post, Param } from '@nestjs/common';
import { UserGateway } from 'src/user/user.gateway';
import { UserService } from 'src/user/user.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly usersService: UserService,
    private readonly userGateway: UserGateway,
  ) {}

  @Post('block/:id')
  async blockUser(@Param('id') id: string) {
    const userId = Number(id);

    // --- міняємо статус в базі ---
    await this.usersService.blockUser(userId);

    // --- відправляємо подію через сокет ---
    this.userGateway.blockUser(userId);

    return { status: 'ok', message: `User ${userId} blocked` };
  }
}
