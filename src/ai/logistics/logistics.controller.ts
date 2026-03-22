import { Controller, Post, Body, UseInterceptors, UploadedFiles, BadRequestException } from '@nestjs/common';
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
    console.log(text, 'text 18 ai controller');
    console.log(files, 'files 19 ai controller');
    console.log('TEXT -f ilessss 20 ai controller');

    if (!files) {
      throw new BadRequestException('Файл не передано або неправильний Content-Type --------------------------------------');
    }
    console.log(text, 'text');
    console.log(files, 'files');
    console.log('TEXT -f ilessss');


    return this.parserService.parseCargo(text, files.images, files.audio);
  }

  @Post('parse-tender')
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