import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { Authorized } from 'src/auth/decorators/authorized.decorator';
import { AdminOnlyGuard, IctViewerGuard } from 'src/common/guards/role.guards';
import { trainingMulterOptions } from './training.constants';
import { TrainingService } from './training.service';

@Authorization()
@Controller('training')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Get()
  @UseGuards(IctViewerGuard)
  list() {
    return this.trainingService.list();
  }

  // Гард адміна стоїть до інтерсептора: не-адмін не зможе залити файл на диск.
  @Post()
  @UseGuards(AdminOnlyGuard)
  @UseInterceptors(FileInterceptor('file', trainingMulterOptions))
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Authorized() user: any,
  ) {
    return this.trainingService.create(file, body, user);
  }

  @Get(':id/token')
  @UseGuards(IctViewerGuard)
  getToken(@Param('id', ParseUUIDPipe) id: string, @Authorized() user: any) {
    return this.trainingService.createStreamToken(id, user.id);
  }

  // Плеєр робить багато Range-запитів при перемотуванні — глобальний ліміт тут заважає.
  @SkipThrottle()
  @Get(':id/stream')
  @UseGuards(IctViewerGuard)
  stream(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('t') token: string,
    @Authorized() user: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.trainingService.stream(id, token, user, req, res);
  }

  @Patch(':id')
  @UseGuards(AdminOnlyGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.trainingService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(AdminOnlyGuard)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.trainingService.remove(id);
  }
}
