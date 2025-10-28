import { Module } from '@nestjs/common';
import { FormDataService } from './form-data.service';
import { FormDataController } from './form-data.controller';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { AuthModule } from 'src/auth/auth.module';
import { UserModule } from 'src/user/user.module';

@Module({
  controllers: [FormDataController],
  providers: [FormDataService, AuthGuard],
  imports: [AuthModule,UserModule],
})
export class FormDataModule {}
