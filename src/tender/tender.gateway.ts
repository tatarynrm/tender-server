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
  namespace: '/tender',
  cors: true,
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class TenderGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  // Користувач підключився
  async handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId as string;
    if (!userId) {
      client.disconnect(true);
      return;
    }

    console.log(`${userId} підключений до namespace /tender`);

    // Зберігаємо всі сокети користувача
    await this.redisClient.sAdd(`tender_sockets:${userId}`, client.id);
    await this.redisClient.set(`socket_user:${client.id}`, userId, { EX: 3600 });
  }

  // Користувач відключився
  async handleDisconnect(client: Socket) {
    const userId = await this.redisClient.get(`socket_user:${client.id}`);

    if (userId) {
      await this.redisClient.sRem(`tender_sockets:${userId}`, client.id);
      await this.redisClient.del(`socket_user:${client.id}`);
    }
  }

  // Відправка події користувачу (усім його сокетам)
  async emitToUser(userId: string, event: string, payload: any) {
    const socketIds = await this.redisClient.sMembers(`tender_sockets:${userId}`);
    for (const id of socketIds) {
      const targetSocket = this.server.sockets.sockets.get(id);
      targetSocket?.emit(event, payload);
    }
  }

  // Відправка події всім користувачам
  emitToAll(event: string, payload: any) {
    console.log('EMIT IS WORKING');
    this.server.emit(event, payload);
  }
}
