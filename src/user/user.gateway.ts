import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject } from '@nestjs/common';
import type { RedisClientType } from 'redis';

@WebSocketGateway({ namespace: '/user', cors: { origin: '*' } })
export class UserGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private activeUsers = new Map<number, string>();

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  async handleConnection(client: Socket) {
    const userId = Number(client.handshake.query.userId);
    if (!userId) return;

    this.activeUsers.set(userId, client.id);

    // Зберігаємо сокет в Redis
    await this.redisClient.set(`user_socket:${userId}`, client.id, {
      EX: 3600,
    });

    console.log(`User ${userId} connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    const entry = [...this.activeUsers.entries()].find(
      ([, socketId]) => socketId === client.id,
    );
    if (entry) {
      const [userId] = entry;
      this.activeUsers.delete(userId);
      await this.redisClient.del(`user_socket:${userId}`);
      console.log(`User ${userId} disconnected`);
    }
  }

  async blockUser(userId: number) {
    // Отримуємо сокет з Redis
    const socketId = await this.redisClient.get(`user_socket:${userId}`);
    if (socketId) {
      this.server
        .to(socketId)
        .emit('USER_BLOCKED', { message: 'You are blocked!' });
    }
  }


  
}
