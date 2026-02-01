import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { RedisClientType } from 'redis';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/load', cors: true })
export class LoadGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly ONLINE_TRACKER_KEY = 'crm_online_users_active';

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

async handleConnection(@ConnectedSocket() client: Socket) {
  const userId = client.handshake.auth?.userId?.toString();
  if (!userId) return client.disconnect(true);

  const now = Math.floor(Date.now() / 1000);

  // Запускаємо все разом
  await Promise.all([
    this.redisClient.sAdd(`load_sockets:${userId}`, client.id),
    this.redisClient.set(`socket_load:${client.id}`, userId, { EX: 86400 }),
    this.redisClient.zAdd(this.ONLINE_TRACKER_KEY, { score: now, value: userId })
  ]);

  const socketCount = await this.redisClient.sCard(`load_sockets:${userId}`);
  if (socketCount === 1) {
    // Broadcast йде миттєво після запису
    this.server.emit('user_status_change', { userId, isOnline: true });
  }
}

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    const socketKey = `socket_load:${client.id}`;
    const userId = await this.redisClient.get(socketKey);

    if (userId) {
      const userSocketsKey = `load_sockets:${userId}`;

      await this.redisClient.sRem(userSocketsKey, client.id);
      await this.redisClient.del(socketKey);

      const remainingSockets = await this.redisClient.sCard(userSocketsKey);

      // Якщо сокетів більше немає — юзер реально офлайн
      if (remainingSockets === 0) {
        await this.redisClient.zRem(this.ONLINE_TRACKER_KEY, userId);
        this.server.emit('user_status_change', { userId, isOnline: false });
        console.log(`[LoadGateway] Manager ${userId} is OFFLINE`);
      }
    }
  }

  // Відправка події всім користувачам
  // Спрощуємо, прибираємо дублювання
  notifyAboutUpdate(loadId: number) {
    // Якщо хочемо надіслати тільки ID
    this.server.emit('edit_load_comment', loadId);
  }

  emitToAll(event: string, payload: any) {
    this.server.emit(event, payload);
  }
  // Обробка події "send_update"
  @SubscribeMessage('send_update')
  async handleSendUpdate(@ConnectedSocket() socket: Socket, payload: any) {
    console.log('Received update from client:', payload);

    // Відправка події всім клієнтам
    this.server.emit('update_from_server', payload);

    // socket.broadcast.emit('message_to_all'); // для всіх інших
  }

  // Не забувай про heartbeat тут теж!
  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const userId = client.handshake.auth?.userId?.toString();
    if (userId) {
      const now = Math.floor(Date.now() / 1000);
      await this.redisClient.zAdd(this.ONLINE_TRACKER_KEY, {
        score: now,
        value: userId,
      });
    }
  }

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers() {
    const threshold = Math.floor(Date.now() / 1000) - 120;
    return await this.redisClient.zRangeByScore(
      this.ONLINE_TRACKER_KEY,
      threshold,
      '+inf',
    );
  }
}
