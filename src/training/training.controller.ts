import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { XhrOnlyGuard } from 'src/common/guards/xhr-only.guard';
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
  @UseGuards(XhrOnlyGuard, AdminOnlyGuard)
  @UseInterceptors(FileInterceptor('file', trainingMulterOptions))
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @Authorized() user: any,
  ) {
    return this.trainingService.create(file, body, user);
  }

  // ---------- Завантаження частинами (великі відео) ----------
  // Один запит на весь файл обривався на проксі / requestTimeout (~600MB),
  // тому фронт ріже файл на шматки по TRAINING_UPLOAD_CHUNK.

  @Post('upload/init')
  @UseGuards(XhrOnlyGuard, AdminOnlyGuard)
  initUpload(@Body() body: any, @Authorized() user: any) {
    return this.trainingService.initUpload(body, user);
  }

  // Тіло — сирі байти (application/octet-stream): body-parser їх не чіпає,
  // сервіс читає потік запиту сам і пише на потрібне місце у файлі.
  // Шматків багато, а маршрут лише для адміна — глобальний ліміт запитів тут заважає.
  @SkipThrottle()
  @Put('upload/:uploadId/chunks/:index')
  @UseGuards(XhrOnlyGuard, AdminOnlyGuard)
  uploadChunk(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Param('index') index: string,
    @Req() req: Request,
    @Authorized() user: any,
  ) {
    return this.trainingService.uploadChunk(uploadId, index, req, user);
  }

  @Post('upload/:uploadId/complete')
  @UseGuards(XhrOnlyGuard, AdminOnlyGuard)
  completeUpload(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Authorized() user: any,
  ) {
    return this.trainingService.completeUpload(uploadId, user);
  }

  @Delete('upload/:uploadId')
  @UseGuards(XhrOnlyGuard, AdminOnlyGuard)
  abortUpload(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Authorized() user: any,
  ) {
    return this.trainingService.abortUpload(uploadId, user);
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
  @UseGuards(XhrOnlyGuard, AdminOnlyGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.trainingService.update(id, body);
  }

  @Delete(':id')
  @UseGuards(XhrOnlyGuard, AdminOnlyGuard)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.trainingService.remove(id);
  }
}
