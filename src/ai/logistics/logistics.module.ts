import { Module } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { LogisticsController } from './logistics.controller';
import { LogisticsParserService } from './logistics-parser.service';
import { AiModule } from '../ai.module';
import { MulterModule } from '@nestjs/platform-express';
import { MulterConfigService } from '../../config/multer.config.service';

import { memoryStorage } from 'multer';

@Module({
  imports: [
    AiModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 1024 * 1024 * 100 }, // 100MB
    }),
  ],
  controllers: [LogisticsController],
  providers: [LogisticsService, LogisticsParserService],
})
export class LogisticsModule { }
