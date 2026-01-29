// import {
//   WebSocketGateway,
//   WebSocketServer,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
//   ConnectedSocket,
//   SubscribeMessage,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { Inject } from '@nestjs/common';
// import type { RedisClientType } from 'redis';

// @WebSocketGateway({
//   namespace: '/user',
//   cors: true,
//   pingInterval: 25000,
//   pingTimeout: 60000,
// })
// export class UserGateway implements OnGatewayConnection, OnGatewayDisconnect {
//   @WebSocketServer() server: Server;

//   constructor(
//     @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
//   ) {}

//   async handleConnection(@ConnectedSocket() client: Socket) {
//     const userId = client.handshake.auth?.userId?.toString();
//     if (!userId) return client.disconnect(true);

//     await client.join(`user_room:${userId}`);

//     // 1. Зберігаємо ID сокета в сеті юзера
//     await this.redisClient.sAdd(`user_sockets:${userId}`, client.id);

//     // 2. Зв'язок сокета з юзером (ЗМЕНШУЄМО TTL до 5-10 хвилин)
//     // Цього достатньо, бо при кожному heartbeat ми його оновимо
//     await this.redisClient.set(`socket_user:${client.id}`, userId, { EX: 300 });

//     const socketCount = await this.redisClient.sCard(`user_sockets:${userId}`);

//     if (socketCount === 1) {
//       await this.redisClient.sAdd('online_users_set', userId);
//       this.server.emit('user_status_change', { userId, isOnline: true });
//     }
//   }

//   async handleDisconnect(@ConnectedSocket() client: Socket) {
//     // 3. Отримуємо userId перед видаленням
//     const userId = await this.redisClient.get(`socket_user:${client.id}`);

//     if (userId) {
//       await this.redisClient.sRem(`user_sockets:${userId}`, client.id);
//       // 4. Одразу видаляємо запис про сокет
//       await this.redisClient.del(`socket_user:${client.id}`);

//       setTimeout(async () => {
//         const socketCount = await this.redisClient.sCard(
//           `user_sockets:${userId}`,
//         );
//         if (socketCount === 0) {
//           await this.redisClient.sRem('online_users_set', userId);
//           this.server.emit('user_status_change', { userId, isOnline: false });
//         }
//       }, 2000);
//     }
//   }

//   // Емiт конкретному користувачу
//   async emitToUser(userId: string, event: string, payload: any) {
//     this.server.to(`user_room:${userId}`).emit(event, payload);
//   }

//   // Емiт всім
//   emitToAll(event: string, payload: any) {
//     this.server.emit(event, payload);
//   }
//   // Це найкращий шлях
//   async emitToUsers(userIds: string[], event: string, payload: any) {
//     const roomNames = userIds.map((id) => `user_room:${id}`);
//     this.server.to(roomNames).emit(event, payload);
//   }
//   // Heartbeat для продовження TTL сокету
//   @SubscribeMessage('heartbeat')
//   async handleHeartbeat(@ConnectedSocket() client: Socket) {
//     const userId = await this.redisClient.get(`socket_user:${client.id}`);
//     if (userId) {
//       // Продовжуємо життя запису ще на 5 хвилин
//       await this.redisClient.expire(`socket_user:${client.id}`, 300);
//       // Також оновлюємо статус в глобальному сеті про всяк випадок
//       await this.redisClient.sAdd('online_users_set', userId);
//     }
//   }
// }
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

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    const userId = client.handshake.auth?.userId?.toString();
    if (!userId) {
      this.logger.warn(`Disconnecting socket ${client.id}: No userId provided`);
      return client.disconnect(true);
    }

    const socketKey = `socket_user:${client.id}`;
    const userSocketsKey = `user_sockets:${userId}`;
    const globalOnlineKey = 'online_users_set';

    // 1. Прив'язуємо сокет до юзера
    await this.redisClient.set(socketKey, userId, { EX: 86400 });

    // 2. Додаємо сокет в набір активних з'єднань юзера
    await this.redisClient.sAdd(userSocketsKey, client.id);
    await this.redisClient.expire(userSocketsKey, 86400); // Очиститься сам через добу, якщо щось піде не так

    // 3. Додаємо в кімнату для приватних повідомлень
    client.join(`user_room:${userId}`);
    client.join(`user_${userId}`); // Кімната для персональних команд
    // 4. Перевіряємо, чи став юзер онлайн
    const socketCount = await this.redisClient.sCard(userSocketsKey);

    if (socketCount === 1) {
      await this.redisClient.sAdd(globalOnlineKey, userId);
      this.server.emit('user_status_change', { userId, isOnline: true });
      this.logger.log(`User ${userId} is now online (first socket)`);
    }
  }

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    const socketKey = `socket_user:${client.id}`;
    const userId = await this.redisClient.get(socketKey);

    if (userId) {
      const userSocketsKey = `user_sockets:${userId}`;
      const globalOnlineKey = 'online_users_set';

      // 1. Видаляємо поточний сокет негайно
      await this.redisClient.sRem(userSocketsKey, client.id);
      await this.redisClient.del(socketKey);

      // 2. Перевіряємо залишок сокетів БЕЗ затримки для миттєвого ефекту
      // Якщо хочеш залишити захист від F5, зменш до 500-1000мс
      const remainingSockets = await this.redisClient.sCard(userSocketsKey);

      if (remainingSockets === 0) {
        await this.redisClient.sRem(globalOnlineKey, userId);
        // Сповіщаємо всіх, що юзер пішов
        this.server.emit('user_status_change', { userId, isOnline: false });
        this.logger.log(`User ${userId} went offline`);
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

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers() {
    // Повертаємо список всіх, хто в сеті
    return await this.redisClient.sMembers('online_users_set');
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const userId = await this.redisClient.get(`socket_user:${client.id}`);
    if (userId) {
      // Оновлюємо TTL, щоб дані не зникли при високій активності
      await this.redisClient.expire(`socket_user:${client.id}`, 3600);
      await this.redisClient.expire(`user_sockets:${userId}`, 3600);
    }
  }
}
