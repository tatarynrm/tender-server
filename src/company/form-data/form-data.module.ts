import { Module } from '@nestjs/common';
import { FormDataService } from './form-data.service';
import { FormDataController } from './form-data.controller';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { UserModule } from 'src/user/user.module';

@Module({
  providers: [FormDataService,AuthGuard],
  controllers: [FormDataController],
  exports:[FormDataService],
  imports:[UserModule]
  
})
export class FormDataModule {}
