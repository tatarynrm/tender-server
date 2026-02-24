// download.controller.ts
import {
  Controller,
  Get,
  Query,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import axios from 'axios';

@Controller('download')
export class DownloadController {
  private readonly GITHUB_REPO = 'tatarynrm/ictapp'; // Твій репозиторій

  @Get()
  async downloadApp(@Query('platform') platform: string, @Res() res: Response) {
    try {
      // Отримуємо дані про останній реліз через GitHub API
      const { data } = await axios.get(
        `https://api.github.com/repos/${this.GITHUB_REPO}/releases/latest`,
      );

      const extension = platform === 'mac' ? '.dmg' : '.exe';
      const asset = data.assets.find((a: any) => a.name.endsWith(extension));

      if (!asset) {
        throw new HttpException(
          'Файл для цієї платформи не знайдено',
          HttpStatus.NOT_FOUND,
        );
      }

      // 302 Redirect — браузер отримає запит і миттєво почне завантаження з GitHub
      return res.redirect(asset.browser_download_url);
    } catch (error) {
      throw new HttpException(
        'Помилка при отриманні релізу',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
