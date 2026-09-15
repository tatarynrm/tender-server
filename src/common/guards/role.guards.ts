import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Рольового гарда в проєкті немає (@Authorization ігнорує ролі), тому перевіряємо
 * user.role вручну. Гарди вішати на МЕТОД — вони виконуються після класового
 * AuthGuard, який кладе request.user, і до інтерсепторів (тобто до запису файлів
 * multer на диск).
 */
function getUser(context: ExecutionContext) {
  const user = context.switchToHttp().getRequest().user;
  if (!user) throw new UnauthorizedException('Ви не авторизовані');
  return user;
}

/** Працівники ICT та адміністратори. */
@Injectable()
export class IctViewerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const role = getUser(context).role;
    if (!role?.is_ict && !role?.is_admin) {
      throw new ForbiddenException('Розділ доступний лише працівникам ICT');
    }
    return true;
  }
}

/** Лише адміністратори. */
@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (!getUser(context).role?.is_admin) {
      throw new ForbiddenException('Дія доступна лише адміністраторам');
    }
    return true;
  }
}
