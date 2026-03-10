// src/logistics/logistics.controller.ts
import { Controller, Post, Body, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { LogisticsParserService } from './logistics-parser.service';

@Controller('ai/logistics')
export class LogisticsController {
  constructor(private readonly parserService: LogisticsParserService) { }

  @Post('parse-cargo')
  @UseInterceptors(FilesInterceptor('images')) // Підтримка завантаження фото
  async parseCargo(
    @Body('text') text: string,
    @UploadedFiles() images?: Express.Multer.File[]
  ) {
    console.log(text, images);
    return this.parserService.parseCargo(text, images);
  }
}