import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LocalAiAccess } from './guards/local-ai-access.decorator';
import { LocalAiService } from './local-ai.service';

/**
 * HTTP-вхід локального помічника.
 *
 * DTO типізовані як `any` свідомо: глобальний ValidationPipe стоїть із
 * forbidNonWhitelisted, і будь-яке зайве поле з фронта дало б 400.
 * Це чинна конвенція проєкту для нових ендпоінтів.
 *
 * Замість звичного @Authorization() тут @LocalAiAccess(): він додає до
 * AuthGuard ще й перевірку пошти — помічник поки персональний, і новий
 * ендпоінт у цьому контролері не може випадково лишитися відкритим.
 */
@ApiTags('Local AI')
@LocalAiAccess()
@Controller('local-ai')
export class LocalAiController {
  constructor(private readonly localAiService: LocalAiService) {}

  @ApiOperation({ summary: 'Стан локальної моделі та доступні функції' })
  @Get('health')
  public async health() {
    return this.localAiService.health();
  }

  @ApiOperation({
    summary: 'Каталог таблиць Postgres, доступних моделі (лише читання)',
  })
  @Get('schema')
  public async getSchema() {
    return this.localAiService.getSchema();
  }

  @ApiOperation({
    summary: 'Перечитати схему з БД — після зміни структури таблиць',
  })
  @Post('schema/refresh')
  public async refreshSchema() {
    return this.localAiService.refreshSchema();
  }

  @ApiOperation({ summary: 'Список сесій чату користувача' })
  @Get('sessions')
  public async listSessions() {
    return this.localAiService.listSessions();
  }

  @ApiOperation({ summary: 'Створити нову сесію чату' })
  @Post('sessions')
  public async createSession(@Body() dto: any) {
    return this.localAiService.createSession(dto?.title);
  }

  @ApiOperation({ summary: 'Видалити всі сесії користувача' })
  @Delete('sessions')
  public async deleteAllSessions() {
    return this.localAiService.deleteAllSessions();
  }

  @ApiOperation({
    summary: 'Сторінка повідомлень сесії (від кінця розмови)',
    description:
      'offset відлічується від найновішого повідомлення: 0 — хвіст розмови, ' +
      'далі фронт довантажує старіше при скролі вгору.',
  })
  @Get('sessions/:id/messages')
  public async getMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // @Query завжди рядок; NaN від сміття на кшталт ?limit=abc гасимо тут,
    // щоб у сховище не поїхав некоректний зріз
    const toNumber = (v?: string) =>
      v !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined;

    return this.localAiService.getMessages(id, toNumber(limit), toNumber(offset));
  }

  @ApiOperation({ summary: 'Перейменувати сесію' })
  @Patch('sessions/:id')
  public async renameSession(@Param('id') id: string, @Body() dto: any) {
    await this.localAiService.renameSession(id, dto?.title);
    return { status: 'ok' };
  }

  @ApiOperation({ summary: 'Видалити сесію' })
  @Delete('sessions/:id')
  public async deleteSession(@Param('id') id: string) {
    await this.localAiService.deleteSession(id);
    return { status: 'ok' };
  }

  @ApiOperation({ summary: 'Надіслати повідомлення помічнику' })
  @Post('chat')
  public async chat(@Body() dto: any) {
    return this.localAiService.chat(dto?.text, dto?.sessionId);
  }
}
