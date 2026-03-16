import { Module } from '@nestjs/common';
import { TenderService } from './tender.service';
import { TenderController } from './tender.controller';
import { UserService } from 'src/user/user.service';
import { UserModule } from 'src/user/user.module';
import { TenderGateway } from './tender.gateway';
import { LoadGateway } from 'src/crm/load/load.gateway';
import { MulterModule } from '@nestjs/platform-express';
import { MulterConfigService } from '../config/multer.config.service';

@Module({
  imports: [
    UserModule,
    MulterModule.registerAsync({
      useClass: MulterConfigService,
    }),
  ],
  controllers: [TenderController],
  providers: [TenderService, UserService, TenderGateway, LoadGateway],
  exports: [TenderGateway],
})
export class TenderModule {}
