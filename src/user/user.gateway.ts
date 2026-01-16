import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject } from '@nestjs/common';
import type { RedisClientType } from 'redis';

@WebSocketGateway({
  namespace: '/user',
  cors: true,
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class UserGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}



async handleConnection(@ConnectedSocket() client: Socket) {
  const userId = client.handshake.auth?.userId as string;
  if (!userId) return client.disconnect(true);

  // Приєднуємо сокет до кімнати юзера (для зручного emitToUser)
  await client.join(`user_room:${userId}`);

  await this.redisClient.sAdd(`user_sockets:${userId}`, client.id);
  await this.redisClient.set(`socket_user:${client.id}`, userId, { EX: 3600 });

  const socketCount = await this.redisClient.sCard(`user_sockets:${userId}`);
  
  if (socketCount === 1) {
    // Користувач був офлайн, тепер онлайн
    this.server.emit('user_status_change', { userId, isOnline: true });
  }
}

async handleDisconnect(@ConnectedSocket() client: Socket) {
  const userId = await this.redisClient.get(`socket_user:${client.id}`);
  if (!userId) return;

  await this.redisClient.sRem(`user_sockets:${userId}`, client.id);
  await this.redisClient.del(`socket_user:${client.id}`);

  // Чекаємо 2 секунди, щоб перевірити, чи не з'явився новий сокет (оновлення сторінки)
  setTimeout(async () => {
    const socketCount = await this.redisClient.sCard(`user_sockets:${userId}`);
    if (socketCount === 0) {
      this.server.emit('user_status_change', { userId, isOnline: false });
    }
  }, 2000); 
}

// Тепер цей метод максимально простий
async emitToUser(userId: string, event: string, payload: any) {
  this.server.to(`user_room:${userId}`).emit(event, payload);
}

  emitToAll(event: string, payload: any) {
    console.log('EMIT IS WORKING');

    this.server.emit(event, payload);
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const userId = await this.redisClient.get(`socket_user:${client.id}`);
    if (!userId) return;

    // Оновлюємо TTL — юзер "живий"
    await this.redisClient.expire(`socket_user:${client.id}`, 3600);
  }
}




  // Користувач підключився
  // async handleConnection(@ConnectedSocket() client: Socket) {
  //   const userId = client.handshake.auth?.userId as string;
  //   console.log(userId, 'USER ID');
  //   if (!userId) {
  //     client.disconnect(true);
  //     return;
  //   }

  //   await this.redisClient.sAdd(`user_sockets:${userId}`, client.id);
  //   await this.redisClient.set(`socket_user:${client.id}`, userId, {
  //     EX: 3600,
  //   });

  //   console.log(
  //     `[UserGateway] User ${userId} connected with socket ${client.id}`,
  //   );
  // }
  // Користувач відключився
  // async handleDisconnect(@ConnectedSocket() client: Socket) {
  //   const userId = await this.redisClient.get(`socket_user:${client.id}`);
  //   if (userId) {
  //     await this.redisClient.sRem(`user_sockets:${userId}`, client.id);
  //     await this.redisClient.del(`socket_user:${client.id}`);
  //     console.log(
  //       `[UserGateway] User ${userId} disconnected from socket ${client.id}`,
  //     );
  //   }
  // }