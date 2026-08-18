import { Module } from '@nestjs/common';
import { TenderService } from './tender.service';
import { TenderController } from './tender.controller';
import { UserService } from 'src/user/user.service';
import { UserModule } from 'src/user/user.module';
import { TenderGateway } from './tender.gateway';
import { LoadGateway } from 'src/crm/load/load.gateway';
import { MulterModule } from '@nestjs/platform-express';

import { memoryStorage } from 'multer';
import { multerFileFilter, MULTER_LIMITS } from '../config/multer-file-filter';

@Module({
  imports: [
    UserModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: MULTER_LIMITS, // 30MB
      fileFilter: multerFileFilter,
    }),
  ],
  controllers: [TenderController],
  providers: [TenderService, TenderGateway, LoadGateway],
  exports: [TenderGateway],
})
export class TenderModule {}
