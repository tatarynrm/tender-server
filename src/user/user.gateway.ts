import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Logger } from '@nestjs/common';
import type { RedisClientType } from 'redis';

@WebSocketGateway({
  namespace: '/user',
  cors: true,
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class UserGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(UserGateway.name);
  private readonly ONLINE_TRACKER_KEY = 'online_users_active';
  private readonly HEARTBEAT_INTERVAL = 60; // секунд
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    const userId = client.handshake.auth?.userId?.toString();
    if (!userId) return client.disconnect(true);

    const socketKey = `socket_user:${client.id}`;
    const userSocketsKey = `user_sockets:${userId}`;

    await this.redisClient.set(socketKey, userId, { EX: 86400 });
    await this.redisClient.sAdd(userSocketsKey, client.id);

    // Оновлюємо час останньої активності в Sorted Set
    const now = Math.floor(Date.now() / 1000);
    await this.redisClient.zAdd(this.ONLINE_TRACKER_KEY, {
      score: now,
      value: userId,
    });

    const socketCount = await this.redisClient.sCard(userSocketsKey);
    if (socketCount === 1) {
      this.server.emit('user_status_change', { userId, isOnline: true });
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    const userId = await this.redisClient.get(`socket_user:${client.id}`);
    if (userId) {
      const userSocketsKey = `user_sockets:${userId}`;
      await this.redisClient.sRem(userSocketsKey, client.id);
      await this.redisClient.del(`socket_user:${client.id}`);

      const remaining = await this.redisClient.sCard(userSocketsKey);
      if (remaining === 0) {
        await this.redisClient.zRem(this.ONLINE_TRACKER_KEY, userId);
        this.server.emit('user_status_change', { userId, isOnline: false });
      }
    }
  }
  async forceLogout(userId: string) {
    const userSocketsKey = `user_sockets:${userId}`;
    const globalOnlineKey = 'online_users_set';

    // 1. Отримуємо всі ID сокетів цього юзера
    const socketIds = await this.redisClient.sMembers(userSocketsKey);

    // 2. Видаляємо дані з Redis миттєво
    await this.redisClient.del(userSocketsKey);
    await this.redisClient.sRem(globalOnlineKey, userId);

    // 3. Сповіщаємо систему, що він офлайн
    this.server.emit('user_status_change', { userId, isOnline: false });

    // 4. Закриваємо всі з'єднання цього юзера
    socketIds.forEach((socketId) => {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    });

    this.logger.log(
      `Force logout for user ${userId}: all sockets disconnected`,
    );
  }
  // --- МЕТОДИ ВІДПРАВКИ ---

  async emitToUser(userId: string, event: string, payload: any) {
    this.server.to(`user_room:${userId}`).emit(event, payload);
  }

  async emitToUsers(userIds: string[], event: string, payload: any) {
    const rooms = userIds.map((id) => `user_room:${id}`);
    this.server.to(rooms).emit(event, payload);
  }

  emitToAll(event: string, payload: any) {
    this.server.emit(event, payload);
  }

  // --- ОБРОБНИКИ ПОДІЙ ---

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const userId = await this.redisClient.get(`socket_user:${client.id}`);
    if (userId) {
      const now = Math.floor(Date.now() / 1000);
      await this.redisClient.zAdd(this.ONLINE_TRACKER_KEY, {
        score: now,
        value: userId,
      });
      // Продовжуємо життя ключів
      await this.redisClient.expire(`user_sockets:${userId}`, 86400);
    }
  }

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers() {
    // Повертаємо тільки тих, хто був активний протягом останніх 2 хвилин
    const threshold = Math.floor(Date.now() / 1000) - 120;
    return await this.redisClient.zRangeByScore(
      this.ONLINE_TRACKER_KEY,
      threshold,
      '+inf',
    );
  }
}
