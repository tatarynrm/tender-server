import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { databaseProviders } from './database.provider';
import { DatabaseService } from './database.service';
import { ClsModule } from 'nestjs-cls';

@Global()
@Module({
  imports: [ConfigModule,ClsModule.forFeature()],
  providers: [...databaseProviders, DatabaseService],
  exports: [...databaseProviders, DatabaseService], // ✅ Must export to be used in other modules
})
export class DatabaseModule {}
