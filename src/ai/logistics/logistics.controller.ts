import { Controller, Post, Body, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { LogisticsParserService } from './logistics-parser.service';

@Controller('ai/logistics')
export class LogisticsController {
  constructor(private readonly parserService: LogisticsParserService) { }

  @Post('parse-cargo')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'images', maxCount: 10 },
    { name: 'audio', maxCount: 1 }
  ]))
  async parseCargo(
    @Body('text') text: string,
    @UploadedFiles() files: { images?: Express.Multer.File[], audio?: Express.Multer.File[] }
  ) {
    return this.parserService.parseCargo(text, files.images, files.audio);
  }
}