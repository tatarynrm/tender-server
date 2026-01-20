import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { CocktailsService } from './cocktails.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Authorization()
// cocktails.controller.ts
@Controller('cocktails')
export class CocktailsController {
  constructor(private readonly cocktailsService: CocktailsService) {}

@Post('add')
@UseInterceptors(FilesInterceptor('files'))
async createCocktail(
  @UploadedFiles() files: Express.Multer.File[],
  @Body() body: any,
  @Req() req: any,
) {
  // Передаємо body повністю, щоб сервіс бачив імена
  return this.cocktailsService.create(body, files, req.user);
}

  // cocktails.controller.ts
  @Get('list')
  async getCocktails(@Req() req: any) {
    const companyId = req.user.id_company;
    return this.cocktailsService.findAll(companyId);
  }

  @Post('avatar')
  @UseInterceptors(FilesInterceptor('avatar')) // Чекаємо масив 'avatar'
  async uploadAvatar(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @Req() req: any,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Файл не знайдено');
    }

    console.log(body,'BODY -------------------------');
    

    const userId = req.user.id;

    // Оскільки це аватар, беремо лише перший файл з масиву
    const file = files[0];

    // Перевірка шляху для логів
    console.log('Збережено у:', file.path);

    return await this.cocktailsService.updateAvatar(userId, file);
  }
}
