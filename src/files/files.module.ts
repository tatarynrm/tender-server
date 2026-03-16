import { Global, Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { S3Service } from 'src/shared/services/s3.service';
import { ConfigModule } from '@nestjs/config';

import { FilesController } from './files.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [FilesController],
  providers: [FilesService, S3Service],
  exports: [FilesService, S3Service],
})
export class FilesModule {}
