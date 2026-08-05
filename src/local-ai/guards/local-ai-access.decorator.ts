import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { LocalAiAccessGuard } from './local-ai-access.guard';

/**
 * Авторизація + персональний доступ до AI-помічника, одним декоратором.
 *
 * Свідомо не комбінуємо `@Authorization()` з окремим `@UseGuards(...)`:
 * декоратори застосовуються знизу вгору, і при такому записі порядок гардів
 * залежав би від того, як хтось їх переставить у файлі. LocalAiAccessGuard
 * читає `request.user`, який кладе AuthGuard, тож порядок тут заданий явно
 * одним масивом і зламати його випадково неможливо.
 */
export const LocalAiAccess = () =>
  applyDecorators(UseGuards(AuthGuard, LocalAiAccessGuard));
