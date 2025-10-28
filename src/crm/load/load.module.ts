import { Module } from '@nestjs/common';
import { LoadService } from './load.service';
import { LoadController } from './load.controller';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';
import { AuthService } from 'src/auth/auth.service';
import { UserService } from 'src/user/user.service';
import { AuthGuard } from 'src/auth/guards/auth.guard';

@Module({
  controllers: [LoadController],
  providers: [LoadService, AuthGuard],
  imports: [AuthModule, UserModule],
})
export class LoadModule {}
