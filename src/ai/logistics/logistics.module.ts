import { Module } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { LogisticsController } from './logistics.controller';
import { LogisticsParserService } from './logistics-parser.service';
import { AiModule } from '../ai.module';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [AiModule, MulterModule],
  controllers: [LogisticsController],
  providers: [LogisticsService, LogisticsParserService],
})
export class LogisticsModule { }
