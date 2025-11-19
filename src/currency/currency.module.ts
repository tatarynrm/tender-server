import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { DatabaseService } from 'src/database/database.service';

@Module({
  providers: [CurrencyService, DatabaseService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
