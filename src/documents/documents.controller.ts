import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { Authorized } from 'src/auth/decorators/authorized.decorator';
import { AdminOnlyGuard, IctViewerGuard } from 'src/common/guards/role.guards';
import {
  DELETE_CONFIRM_WORD,
  DOCUMENTS_MAX_FILES_PER_UPLOAD,
  documentsMulterOptions,
  isDeleteConfirmed,
} from './documents.constants';
import { DocumentsService } from './documents.service';

/**
 * Документи ICT: переглядати й скачувати — працівники ICT,
 * завантажувати, створювати папки, перейменовувати, переміщати, видаляти — лише адміни.
 */
@Authorization()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @UseGuards(IctViewerGuard)
  getTree() {
    return this.documentsService.getTree();
  }

  // ---------- папки ----------

  @Post('folders')
  @UseGuards(AdminOnlyGuard)
  createFolder(@Body() body: any, @Authorized() user: any) {
    return this.documentsService.createFolder(body, user);
  }

  @Patch('folders/:id')
  @UseGuards(AdminOnlyGuard)
  updateFolder(@Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.documentsService.updateFolder(id, body);
  }

  @Delete('folders/:id')
  @UseGuards(AdminOnlyGuard)
  deleteFolder(@Param('id', ParseUUIDPipe) id: string, @Query('confirm') confirm: string) {
    this.assertDeleteConfirmed(confirm);
    return this.documentsService.deleteFolder(id);
  }

  // ---------- файли ----------

  // Гард адміна виконується до інтерсептора — не-адмін нічого не запише на диск.
  @Post('files')
  @UseGuards(AdminOnlyGuard)
  @UseInterceptors(
    FilesInterceptor('files', DOCUMENTS_MAX_FILES_PER_UPLOAD, documentsMulterOptions),
  )
  upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: any,
    @Authorized() user: any,
  ) {
    return this.documentsService.upload(files, body, user);
  }

  // Скачування папки архівом тягне файли по одному — глобальний ліміт тут заважає.
  @SkipThrottle()
  @Get('files/:id/view')
  @UseGuards(IctViewerGuard)
  view(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    return this.documentsService.sendFile(id, 'view', res);
  }

  @SkipThrottle()
  @Get('files/:id/download')
  @UseGuards(IctViewerGuard)
  download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    return this.documentsService.sendFile(id, 'download', res);
  }

  @Patch('files/:id')
  @UseGuards(AdminOnlyGuard)
  updateFile(@Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return this.documentsService.updateFile(id, body);
  }

  @Delete('files/:id')
  @UseGuards(AdminOnlyGuard)
  deleteFile(@Param('id', ParseUUIDPipe) id: string, @Query('confirm') confirm: string) {
    this.assertDeleteConfirmed(confirm);
    return this.documentsService.deleteFile(id);
  }

  /** Видалення незворотне — без слова ICT (як у діалозі на фронті) нічого не видаляємо. */
  private assertDeleteConfirmed(confirm: string) {
    if (!isDeleteConfirmed(confirm)) {
      throw new BadRequestException(`Підтвердіть видалення словом ${DELETE_CONFIRM_WORD}`);
    }
  }
}
