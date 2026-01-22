import { Injectable } from '@nestjs/common';
import { UserGateway } from 'src/user/user.gateway';


@Injectable()
export class SocketService {
  constructor(private readonly userGateway: UserGateway) {}

  // Відправка одному або декільком
  sendNotification(userIds: string | string[], message: string) {
    const payload = {
      message,
      timestamp: new Date().toISOString(),
    };

    if (Array.isArray(userIds)) {
      // Використовуємо масив кімнат
      const rooms = userIds.map(id => `user_room:${id}`);
      this.userGateway.server.to(rooms).emit('new_notification', payload);
    } else {
      // Одному юзеру
      this.userGateway.emitToUser(userIds, 'new_notification', payload);
    }
    return { success: true, sentTo: userIds };
  }
}