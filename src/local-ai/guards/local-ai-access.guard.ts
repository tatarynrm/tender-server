import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IUserProfile } from 'src/user/types/user.type';

/**
 * Персональний доступ до локального AI-помічника.
 *
 * Модуль поки в дослідній експлуатації: локальна модель займає GPU машини,
 * пише SQL сама і бачить усю схему тендерної платформи. Тому доступ відкритий
 * поіменно, а не за роллю — список пошт задає `LOCAL_AI_ALLOWED_EMAILS`.
 *
 * Гард працює на всі маршрути `/local-ai/*` разом, щоб новий ендпоінт у
 * контролері не міг випадково лишитися відкритим.
 *
 * Читає `request.user`, якого кладе AuthGuard, тому вішається лише разом із ним
 * і суворо після нього — за це відповідає декоратор `@LocalAiAccess()`.
 * Якщо користувача в запиті немає — відмовляємо, а не пропускаємо далі.
 */
@Injectable()
export class LocalAiAccessGuard implements CanActivate {
  private readonly logger = new Logger(LocalAiAccessGuard.name);

  private readonly allowedEmails: string[];

  constructor(private readonly configService: ConfigService) {
    this.allowedEmails = (
      this.configService.get<string>('LOCAL_AI_ALLOWED_EMAILS') ??
      'rt@ict.lviv.ua'
    )
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest() as Request & {
      user?: IUserProfile;
    };

    const email = request.user?.email?.trim().toLowerCase();

    if (!email || !this.allowedEmails.includes(email)) {
      this.logger.warn(
        `Доступ до local-ai відхилено: ${email ?? 'користувач невідомий'}`,
      );
      throw new ForbiddenException(
        'AI-помічник поки доступний обмеженому колу користувачів',
      );
    }

    return true;
  }
}
