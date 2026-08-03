import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { ApprovalService } from './approval.service';

/**
 * Канал погодження для Claude Code. Ходить сюди локальний PreToolUse-хук,
 * тому сесійного AuthGuard тут бути не може — замість нього спільний секрет
 * APPROVAL_SECRET у заголовку. Без нього маршрут відповідає 403.
 */
@Controller('approval')
export class ApprovalController {
  constructor(
    private readonly approvalService: ApprovalService,
    private readonly configService: ConfigService,
  ) {}

  private assertSecret(provided?: string) {
    const expected = this.configService.get<string>('APPROVAL_SECRET');
    if (!expected) {
      throw new ForbiddenException('APPROVAL_SECRET не налаштований');
    }
    const a = Buffer.from(provided || '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Невірний секрет');
    }
  }

  @Post('request')
  async request(
    @Headers('x-approval-secret') secret: string,
    @Body() body: any,
  ) {
    this.assertSecret(secret);

    const tool = String(body?.tool || '').slice(0, 60);
    const summary = String(body?.summary || '').slice(0, 300);
    if (!tool || !summary) {
      throw new BadRequestException('Потрібні tool і summary');
    }

    const rec = await this.approvalService.create({
      tool,
      summary,
      detail: String(body?.detail || '').slice(0, 1500),
    });

    return { id: rec.id, status: rec.status };
  }

  @Get(':id')
  async status(
    @Headers('x-approval-secret') secret: string,
    @Param('id') id: string,
  ) {
    this.assertSecret(secret);

    const rec = await this.approvalService.get(id);
    if (!rec) throw new NotFoundException('Запит не знайдено або прострочений');

    return { id: rec.id, status: rec.status };
  }
}
