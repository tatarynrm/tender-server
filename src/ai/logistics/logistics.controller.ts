import { Controller, Post, Body, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { LogisticsParserService } from './logistics-parser.service';

@Controller('ai/logistics')
export class LogisticsController {
  constructor(private readonly parserService: LogisticsParserService) { }

  @Post('parse-cargo')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // дорогі LLM-виклики
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'images', maxCount: 10 },
    { name: 'audio', maxCount: 1 }
  ]))
  async parseCargo(
    @Body('text') text: string,
    @UploadedFiles() files: { images?: Express.Multer.File[], audio?: Express.Multer.File[] }
  ) {

    if (!files) {
      throw new BadRequestException('Файл не передано або неправильний Content-Type --------------------------------------');
    }


    return this.parserService.parseCargo(text, files.images, files.audio);
  }

  @Post('parse-tender')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // дорогі LLM-виклики
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'images', maxCount: 10 },
    { name: 'audio', maxCount: 1 }
  ]))
  async parseTender(
    @Body('text') text: string,
    @UploadedFiles() files: { images?: Express.Multer.File[], audio?: Express.Multer.File[] }
  ) {
    if (!files) {
      throw new BadRequestException('Файл не передано або неправильний Content-Type');
    }

    return this.parserService.parseTender(text, files.images, files.audio);
  }
}