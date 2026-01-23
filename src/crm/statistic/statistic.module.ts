import { Module } from '@nestjs/common';
import { StatisticService } from './statistic.service';
import { StatisticController } from './statistic.controller';
import { UserModule } from 'src/user/user.module';

@Module({
  imports:[UserModule],
  controllers: [StatisticController],
  providers: [StatisticService],
})
export class StatisticModule {}
