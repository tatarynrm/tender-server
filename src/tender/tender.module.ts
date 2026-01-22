import { Module } from '@nestjs/common';
import { TenderService } from './tender.service';
import { TenderController } from './tender.controller';
import { UserService } from 'src/user/user.service';
import { UserModule } from 'src/user/user.module';
import { TenderGateway } from './tender.gateway';

@Module({
  imports: [UserModule],
  controllers: [TenderController],
  providers: [TenderService, UserService, TenderGateway],
  exports: [TenderGateway],
})
export class TenderModule {}
