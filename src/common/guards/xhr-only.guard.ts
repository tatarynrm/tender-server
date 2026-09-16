import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Захист змінювальних запитів від CSRF.
 *
 * Кука сесії в проді має SameSite=None, тож браузер підставить її і в запит зі стороннього
 * сайту. HTML-форма (POST urlencoded/multipart) проходить без CORS-preflight — отже, чужа
 * сторінка могла б від імені адміна створити папку, залити чи видалити файли.
 *
 * Кастомний заголовок форма надіслати не може, а fetch/axios з ним змушений робити preflight,
 * який CORS (allowlist у main.ts) пропускає лише для наших доменів. Фронт шле його явно.
 */
@Injectable()
export class XhrOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (request.headers['x-requested-with'] !== 'XMLHttpRequest') {
      throw new ForbiddenException('Запит відхилено: дія доступна лише з інтерфейсу платформи');
    }
    return true;
  }
}
