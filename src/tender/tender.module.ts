import { Module } from '@nestjs/common';
import { TenderService } from './tender.service';
import { TenderController } from './tender.controller';
import { UserService } from 'src/user/user.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports:[UserModule],
  controllers: [TenderController],
  providers: [TenderService,UserService],
})
export class TenderModule {}
