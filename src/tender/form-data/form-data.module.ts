import { Module } from '@nestjs/common';
import { FormDataService } from './form-data.service';
import { FormDataController } from './form-data.controller';
import { UserService } from 'src/user/user.service';

@Module({
  controllers: [FormDataController],
  providers: [FormDataService,UserService],
})
export class FormDataModule {}
