import { Module } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { LogisticsController } from './logistics.controller';
import { LogisticsParserService } from './logistics-parser.service';
import { AiModule } from '../ai.module';

@Module({
  imports: [AiModule],
  controllers: [LogisticsController],
  providers: [LogisticsService, LogisticsParserService],
})
export class LogisticsModule {}
