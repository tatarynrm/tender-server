import { Module } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { LogisticsController } from './logistics.controller';
import { LogisticsParserService } from './logistics-parser.service';
import { AiModule } from '../ai.module';
import { MulterModule } from '@nestjs/platform-express';
import { MulterConfigService } from '../../config/multer.config.service';

@Module({
  imports: [
    AiModule,
    MulterModule.registerAsync({
      useClass: MulterConfigService,
    }),
  ],
  controllers: [LogisticsController],
  providers: [LogisticsService, LogisticsParserService],
})
export class LogisticsModule { }
