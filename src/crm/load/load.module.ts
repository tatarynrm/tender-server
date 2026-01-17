import { Module } from '@nestjs/common';
import { LoadService } from './load.service';
import { LoadController } from './load.controller';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';
import { AuthService } from 'src/auth/auth.service';
import { UserService } from 'src/user/user.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { DatabaseService } from 'src/database/database.service';
import { DatabaseModule } from 'src/database/database.module';
import { TenderGateway } from 'src/tender/tender.gateway';
import { LoadGateway } from './load.gateway';

@Module({
  controllers: [LoadController],
  providers: [LoadService, AuthGuard, DatabaseService,LoadGateway],
  imports: [AuthModule, UserModule, DatabaseModule],
  exports:[LoadGateway]
})
export class LoadModule {}
