import { forwardRef, Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { LoadModule } from './load/load.module';
import { AuthModule } from 'src/auth/auth.module';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { UserModule } from 'src/user/user.module';
import { FormDataModule } from './form-data/form-data.module';

@Module({
  imports: [LoadModule, UserModule, FormDataModule],
  controllers: [CrmController],
  providers: [CrmService, AuthGuard],
})
export class CrmModule {}
