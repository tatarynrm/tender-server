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
import { SocketSessionService } from 'src/libs/common/socket/socket-session.service';

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
  private readonly SOCKET_TTL = 86400; // секунд — TTL presence-ключів
  private readonly ONLINE_WINDOW = 120; // секунд — вікно «онлайн»
  // Кімнати за роллю: наші менеджери ICT окремо від перевізників.
  private readonly ROOM_ICT = 'role:ict';
  private readonly ROOM_CARRIER = 'role:carrier';
  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
    private readonly socketSession: SocketSessionService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    // Пріоритет — перевірена сесія (кука centrifuge): їй довіряємо userId і роль.
    // Якщо сесії немає (старий клієнт без credentials) — падаємо назад на
    // handshake, щоб не рвати живі з'єднання. Роль тоді невідома → перевізник.
    const session = await this.socketSession.resolve(client);
    const userId = session?.userId ?? client.handshake.auth?.userId?.toString();
    if (!userId) return client.disconnect(true);

    const isIct = session?.ict ?? client.handshake.auth?.ict === true;
    client.data.userId = userId;
    client.data.ict = isIct;

    const socketKey = `socket_user:${client.id}`;
    const userSocketsKey = `user_sockets:${userId}`;

    await this.redisClient.set(socketKey, userId, { EX: this.SOCKET_TTL });
    await this.redisClient.sAdd(userSocketsKey, client.id);
    // TTL ставимо одразу (раніше — лише в heartbeat), щоб при аварійному
    // розриві ключ згас сам і не тік у Redis.
    await this.redisClient.expire(userSocketsKey, this.SOCKET_TTL);

    // Особиста кімната для приватних повідомлень
    client.join(`user_room:${userId}`);
    // Розділення каналів під майбутні сповіщення «лише для нас».
    client.join(isIct ? this.ROOM_ICT : this.ROOM_CARRIER);

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

    // 1. Отримуємо всі ID сокетів цього юзера
    const socketIds = await this.redisClient.sMembers(userSocketsKey);

    // 2. Видаляємо дані з Redis миттєво. Прибираємо з реального трекера
    // присутності (online_users_active), а не з мертвого online_users_set.
    await this.redisClient.del(userSocketsKey);
    await this.redisClient.zRem(this.ONLINE_TRACKER_KEY, userId);

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

  /** Сповіщення лише нашим менеджерам ICT (окремий канал). */
  emitToIct(event: string, payload: any) {
    this.server.to(this.ROOM_ICT).emit(event, payload);
  }

  /** Сповіщення лише перевізникам. */
  emitToCarriers(event: string, payload: any) {
    this.server.to(this.ROOM_CARRIER).emit(event, payload);
  }

  // --- ОБРОБНИКИ ПОДІЙ ---

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const userId =
      client.data?.userId ??
      (await this.redisClient.get(`socket_user:${client.id}`));
    if (userId) {
      const now = Math.floor(Date.now() / 1000);
      await this.redisClient.zAdd(this.ONLINE_TRACKER_KEY, {
        score: now,
        value: userId,
      });
      // Продовжуємо життя ключів
      await this.redisClient.expire(`user_sockets:${userId}`, this.SOCKET_TTL);
    }
  }

  @SubscribeMessage('get_online_users')
  async handleGetOnlineUsers() {
    const now = Math.floor(Date.now() / 1000);
    const threshold = now - this.ONLINE_WINDOW;
    // Самоочистка: фізично прибираємо протухлі записи, а не лише ховаємо з
    // видачі — інакше ZSET ріс би без стелі при аварійних розривах.
    await this.redisClient.zRemRangeByScore(
      this.ONLINE_TRACKER_KEY,
      0,
      threshold,
    );
    // Повертаємо тільки активних за останні 2 хвилини
    return await this.redisClient.zRangeByScore(
      this.ONLINE_TRACKER_KEY,
      threshold,
      '+inf',
    );
  }
}
