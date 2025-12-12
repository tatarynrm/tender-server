import { Module } from '@nestjs/common';
import { TransportService } from './transport.service';
import { TransportController } from './transport.controller';
import { DatabaseModule } from 'src/database/database.module';
import { UserModule } from 'src/user/user.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  controllers: [TransportController],
  providers: [TransportService],
  imports: [AuthModule, UserModule, DatabaseModule],
})
export class TransportModule {}
