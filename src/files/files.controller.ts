import { Controller, Get, Query, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import axios from 'axios';

@Controller('files')
export class FilesController {
  @Get('proxy')
  async proxyFile(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      return res.status(HttpStatus.BAD_REQUEST).send('URL is required');
    }

    try {
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
      });

      // Передаємо заголовки типу контенту
      res.setHeader('Content-Type', response.headers['content-type']);
      
      // Стрімимо дані клієнту
      response.data.pipe(res);
    } catch (error) {
      console.error('Error proxying file:', error.message);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error fetching file');
    }
  }
}
