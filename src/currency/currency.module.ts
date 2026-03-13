import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CurrencyService } from './currency.service';
import { CurrencyProcessor } from './processors/currency.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'currency-tasks',
    }),
  ],
  providers: [CurrencyService, CurrencyProcessor],
  exports: [CurrencyService],
})
export class CurrencyModule {}
