import { Module } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { LogisticsController } from './logistics.controller';
import { LogisticsParserService } from './logistics-parser.service';
import { AiModule } from '../ai.module';
import { MulterModule } from '@nestjs/platform-express';

import { memoryStorage } from 'multer';
import { multerFileFilter, MULTER_LIMITS } from '../../config/multer-file-filter';

import { LocationModule } from '../../location/location.module';

@Module({
  imports: [
    AiModule,
    LocationModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: MULTER_LIMITS, // 30MB
      fileFilter: multerFileFilter,
    }),
  ],
  controllers: [LogisticsController],
  providers: [LogisticsService, LogisticsParserService],
})
export class LogisticsModule { }
