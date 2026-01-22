import { Module } from '@nestjs/common';
import { SocketService } from './socket.service';
import { SocketController } from './socket.controller';
import { UserModule } from 'src/user/user.module';
import { UserGateway } from 'src/user/user.gateway';

@Module({
  imports:[UserModule],
  controllers: [SocketController],
  providers: [SocketService,UserGateway],
})
export class SocketModule {}
