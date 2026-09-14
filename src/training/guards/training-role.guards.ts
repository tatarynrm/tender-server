import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Рольового гарда в проєкті немає (@Authorization ігнорує ролі), тому перевіряємо
 * user.role вручну. Гарди вішаються на метод — вони виконуються після
 * класового AuthGuard, який кладе request.user.
 */
function getUser(context: ExecutionContext) {
  const user = context.switchToHttp().getRequest().user;
  if (!user) throw new UnauthorizedException('Ви не авторизовані');
  return user;
}

/** Перегляд навчання — працівники ICT та адміністратори. */
@Injectable()
export class TrainingViewerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const role = getUser(context).role;
    if (!role?.is_ict && !role?.is_admin) {
      throw new ForbiddenException('Навчання доступне лише працівникам ICT');
    }
    return true;
  }
}

/** Завантаження, редагування, видалення — лише адміністратори. */
@Injectable()
export class TrainingAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (!getUser(context).role?.is_admin) {
      throw new ForbiddenException('Керувати навчанням можуть лише адміністратори');
    }
    return true;
  }
}
