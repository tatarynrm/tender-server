import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { LoadModule } from './load/load.module';

@Module({
  controllers: [CrmController],
  providers: [CrmService],
  imports: [LoadModule],
})
export class CrmModule {}
