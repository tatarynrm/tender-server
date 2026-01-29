// src/systems/system.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/user',
  cors: true,
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class SystemGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId?.toString();
    console.log('USER IDDDDDDDDDDDDDDDDDD',userId);
    
    if (userId) {
      client.join(`user_${userId}`); // Кімната для персональних команд
      console.log(`User ${userId} joined system room`);
    }
  }

  // Метод, який викликається з контролера
  emitCommand(type: string, payload: any, targetUserId?: string) {
    if (targetUserId) {
      // Тільки конкретному юзеру
      this.server
        .to(`user_${targetUserId}`)
        .emit('system_command', { type, payload });
    } else {
      // Всім підключеним

      this.server.emit('system_command', { type, payload });
    }
  }
}
