import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { RedisClientType } from 'redis';

// Оновлений декоратор WebSocketGateway
@WebSocketGateway({
  namespace: '/chat', // Простір імен для чату
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server; // Сервер для надсилання подій

  constructor(
    @Inject('REDIS_CLIENT') private redisClient: RedisClientType, // Інжекція Redis-клієнта
  ) {}

  // Обробка підключення клієнта
  handleConnection(socket: Socket) {
    console.log(`Client connected: ${socket.id}`);

    // Перевірка, чи переданий userId в параметрах запиту
    const userId = socket.handshake.query.userId as string;
    console.log(userId, 'USER ID');

    if (!userId) {
      console.error('User ID is missing!');
      return;
    }

    // Реєструємо socket.id для конкретного користувача в Redis
    this.redisClient.sAdd(`chat_user:${userId}`, socket.id);
  }

  // Обробка відключення клієнта
  handleDisconnect(socket: Socket) {
    console.log(`Client disconnected: ${socket.id}`);

    // Отримуємо userId з параметрів запиту сокета
    const userId = socket.handshake.query.userId as string;
    if (!userId) {
      console.error('User ID is missing!');
      return;
    }

    // Видаляємо сокет з Redis, використовуючи userId
    this.redisClient.sRem(`chat_user:${userId}`, socket.id);
  }

  // Метод для надсилання повідомлення користувачу за його userId
  async emitToUser(userId: string, event: string, payload: any) {
    const socketIds = await this.redisClient.sMembers(`chat_user:${userId}`);
    console.log(socketIds, 'SOCKET IDS'); // Логування для дебагу

    // Якщо немає активних сокетів для цього користувача
    if (socketIds.length === 0) {
      console.log(`[ChatGateway] User ${userId} is not connected.`);
      return;
    }

    // Відправлення повідомлення всім сокетам цього користувача
    for (const socketId of socketIds) {
      this.server.to(socketId).emit(event, payload);
    }
  }

  // Підписка на подію 'send_message_to_user_group' для надсилання повідомлень користувачам з однаковим userId
  @SubscribeMessage('send_message_to_user_group')
  async handleMessageToUserGroup(
    @MessageBody() data: { text: string; userId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const { text, userId } = data;
    const timestamp = new Date().toISOString();
    const message = { text, timestamp, fromUserId: socket.id };

    // Відправляємо всім socketId окрім того, що відправив
    const socketIds = await this.redisClient.sMembers(`chat_user:${userId}`);
    for (const socketId of socketIds) {
      if (socketId !== socket.id) {
        // пропускаємо власний socket
        this.server.to(socketId).emit('message_to_user_group', message);
      }
    }

    // Підтвердження для відправника
    socket.emit('message_received', message);
  }
  @SubscribeMessage('send_message_to_all')
  async handleMessageToAll(
    @MessageBody() data: { text: string }, // Текст повідомлення
    @ConnectedSocket() socket: Socket, // Підключений сокет
  ) {
    const { text } = data;
    const timestamp = new Date().toISOString(); // Отримуємо timestamp для повідомлення
    const message = { text, timestamp, fromUserId: socket.id }; // Створюємо повідомлення

    // Відправляємо повідомлення всім підключеним користувачам
    socket.broadcast.emit('message_to_all', message);

    // Підтвердження для відправника
    // socket.emit('message_received', message); // Підтвердження для того, хто відправив
  }
}
