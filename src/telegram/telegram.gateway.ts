import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Injectable } from '@nestjs/common';
import type { RedisClientType } from 'redis';

@WebSocketGateway({ namespace: '/telegram', cors: { origin: '*' } })
@Injectable()
export class TelegramGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private activeSockets = new Map<number, string>(); // userId → socketId

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  async handleConnection(client: Socket) {
    const userId = Number(client.handshake.query.userId);
    if (!userId) return;

    this.activeSockets.set(userId, client.id);
    await this.redisClient.set(`telegram_socket:${userId}`, client.id, {
      EX: 3600,
    });

    console.log(
      `📲 Telegram socket connected for user ${userId}: ${client.id}`,
    );
  }

  async handleDisconnect(client: Socket) {
    const entry = [...this.activeSockets.entries()].find(
      ([, socketId]) => socketId === client.id,
    );
    if (entry) {
      const [userId] = entry;
      this.activeSockets.delete(userId);
      await this.redisClient.del(`telegram_socket:${userId}`);
      console.log(`🔌 Telegram socket disconnected for user ${userId}`);
    }
  }

  // 🟢 Метод для повідомлення про успішне підключення
  // async notifyTelegramConnected(userId: number) {
  //   const socketId = await this.redisClient.get(`telegram_socket:${userId}`);
  //   if (socketId) {
  //     this.server.to(socketId).emit('TELEGRAM_CONNECTED', {
  //       message: '✅ Telegram успішно підключено!',
  //     });
  //     console.log(`📨 Sent TELEGRAM_CONNECTED to user ${userId}`);
  //   } else {
  //     console.log(`⚠️ No active Telegram socket for user ${userId}`);
  //   }
  // }
  // async notifyTelegramDisonnected(userId: number) {
  //   const socketId = await this.redisClient.get(`telegram_socket:${userId}`);
  //   if (socketId) {
  //     this.server.to(socketId).emit('TELEGRAM_DISCONNECTED', {
  //       message: '✅ Telegram успішно підключено!',
  //     });
  //     console.log(`📨 Sent TELEGRAM_DISCONNECTED from user ${userId}`);
  //   } else {
  //     console.log(`⚠️ No active Telegram socket for user ${userId}`);
  //   }
  // }
}
