// import {
//   WebSocketGateway,
//   WebSocketServer,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
//   ConnectedSocket,
//   SubscribeMessage,
//   MessageBody,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { Inject } from '@nestjs/common';
// import type { RedisClientType } from 'redis';

// @WebSocketGateway({ namespace: '/user', cors: true })
// export class LoadGateway implements OnGatewayConnection, OnGatewayDisconnect {
//   @WebSocketServer() server!: Server;

//   constructor(
//     @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
//   ) {}

//   // 🔹 Підключення клієнта
//   async handleConnection(socket: Socket) {
//     // Беремо loadId з handshake.auth
//     const loadId = socket.handshake.auth.loadId as string;
//     console.log(loadId, 'LOAD ID FROM AUTH');

//     if (!loadId) {
//       console.error('[LoadGateway] loadId is missing in handshake auth');
//       return socket.disconnect();
//     }

//     await this.redisClient.sAdd(`load_sockets:${loadId}`, socket.id);
//     await this.redisClient.set(`socket_load:${socket.id}`, loadId, {
//       EX: 3600,
//     });

//     console.log(`[LoadGateway] Load ${loadId} connected (${socket.id})`);
//   }

//   // 🔹 Відключення клієнта
//   async handleDisconnect(socket: Socket) {
//     const loadId = await this.redisClient.get(`socket_load:${socket.id}`);
//     if (!loadId) return;

//     await this.redisClient.sRem(`load_sockets:${loadId}`, socket.id);
//     await this.redisClient.del(`socket_load:${socket.id}`);

//     console.log(`[LoadGateway] Load ${loadId} disconnected (${socket.id})`);
//   }

//   // 🔹 Надсилання події всім сокетам loadId
//   async emitToLoad(loadId: string, event: string, payload: any) {
//     const socketIds = await this.redisClient.sMembers(`load_sockets:${loadId}`);
//     if (!socketIds?.length) {
//       console.log(`[LoadGateway] Load ${loadId} has no active sockets`);
//       return;
//     }

//     for (const socketId of socketIds) {
//       this.server.to(socketId).emit(event, payload);
//     }
//   }

//   // 🔹 Отримання повідомлень для конкретного load
// @SubscribeMessage('update_load')
// async handleUpdateLoad(
//   @ConnectedSocket() socket: Socket,
//   @MessageBody() payload: { loadId: string; data: any },
// ) {
//   // if (!payload?.loadId || !payload.data) return;
// console.log('emiting to all');

//   // Надсилаємо всім сокетам конкретного loadId
//   // await this.emitToLoad(payload.loadId, 'update_load_receive', payload.data);
//   socket.emit('update_load_receive')
// }

// }
import { Inject } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
} from '@nestjs/websockets';
import type { RedisClientType } from 'redis';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/load', cors: true })
export class LoadGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  // Обробка підключень
  // Користувач підключився
  async handleConnection(@ConnectedSocket() client: Socket) {
    const userId = client.handshake.auth?.userId as string;
    console.log(userId, 'USER ID');
    if (!userId) {
      client.disconnect(true);
      return;
    }

    await this.redisClient.sAdd(`load_sockets:${userId}`, client.id);
    await this.redisClient.set(`socket_load:${client.id}`, userId, {
      EX: 3600,
    });

    console.log(
      `[UserGateway] User ${userId} connected with socket ${client.id}`,
    );
  }
  // Користувач відключився
  async handleDisconnect(@ConnectedSocket() client: Socket) {
    const userId = await this.redisClient.get(`socket_load:${client.id}`);
    if (userId) {
      await this.redisClient.sRem(`load_sockets:${userId}`, client.id);
      await this.redisClient.del(`socket_load:${client.id}`);
      console.log(
        `[UserGateway] User ${userId} disconnected from socket ${client.id}`,
      );
    }
  }
  // Відправка події всім користувачам
  emitToAll(event: string, payload: any) {
    console.log('EMIT IS WORKING');
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
}
