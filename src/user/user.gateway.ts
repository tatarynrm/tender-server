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
    const userId = client.handshake.auth?.userId?.toString();
    if (!userId) return client.disconnect(true);

    await client.join(`user_room:${userId}`);

    // 1. Зберігаємо ID сокета в сеті юзера
    await this.redisClient.sAdd(`user_sockets:${userId}`, client.id);

    // 2. Зв'язок сокета з юзером (ЗМЕНШУЄМО TTL до 5-10 хвилин)
    // Цього достатньо, бо при кожному heartbeat ми його оновимо
    await this.redisClient.set(`socket_user:${client.id}`, userId, { EX: 300 });

    const socketCount = await this.redisClient.sCard(`user_sockets:${userId}`);

    if (socketCount === 1) {
      await this.redisClient.sAdd('online_users_set', userId);
      this.server.emit('user_status_change', { userId, isOnline: true });
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    // 3. Отримуємо userId перед видаленням
    const userId = await this.redisClient.get(`socket_user:${client.id}`);

    if (userId) {
      await this.redisClient.sRem(`user_sockets:${userId}`, client.id);
      // 4. Одразу видаляємо запис про сокет
      await this.redisClient.del(`socket_user:${client.id}`);

      setTimeout(async () => {
        const socketCount = await this.redisClient.sCard(
          `user_sockets:${userId}`,
        );
        if (socketCount === 0) {
          await this.redisClient.sRem('online_users_set', userId);
          this.server.emit('user_status_change', { userId, isOnline: false });
        }
      }, 2000);
    }
  }

  // Емiт конкретному користувачу
  async emitToUser(userId: string, event: string, payload: any) {
    this.server.to(`user_room:${userId}`).emit(event, payload);
  }

  // Емiт всім
  emitToAll(event: string, payload: any) {
    this.server.emit(event, payload);
  }
  // Це найкращий шлях
  async emitToUsers(userIds: string[], event: string, payload: any) {
    const roomNames = userIds.map((id) => `user_room:${id}`);
    this.server.to(roomNames).emit(event, payload);
  }
  // Heartbeat для продовження TTL сокету
  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const userId = await this.redisClient.get(`socket_user:${client.id}`);
    if (userId) {
      // Продовжуємо життя запису ще на 5 хвилин
      await this.redisClient.expire(`socket_user:${client.id}`, 300);
      // Також оновлюємо статус в глобальному сеті про всяк випадок
      await this.redisClient.sAdd('online_users_set', userId);
    }
  }
}
