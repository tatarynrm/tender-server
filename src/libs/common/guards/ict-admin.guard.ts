import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Доступ лише для адміністраторів ICT (role.is_ict && role.is_admin) — та сама
 * умова, за якою фронт показує адмін-функції. Ставиться ПІСЛЯ AuthGuard, який
 * кладе перевіреного користувача в request.user. Логіку не змінює — лише гейт.
 */
@Injectable()
export class IctAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const role = req.user?.role;
    if (role?.is_ict && role?.is_admin) {
      return true;
    }
    throw new ForbiddenException('Доступ лише для адміністраторів ICT');
  }
}
