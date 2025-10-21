import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { databaseProviders } from './database.provider';
import { DatabaseService } from './database.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [...databaseProviders,DatabaseService],
  exports: [...databaseProviders,DatabaseService], // ✅ Must export to be used in other modules
})
export class DatabaseModule {}
