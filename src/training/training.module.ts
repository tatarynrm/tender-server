import { Module } from '@nestjs/common';
import { UserModule } from 'src/user/user.module';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

@Module({
  imports: [UserModule], // UserService потрібен AuthGuard
  controllers: [TrainingController],
  providers: [TrainingService],
})
export class TrainingModule {}
