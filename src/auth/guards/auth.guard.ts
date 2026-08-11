import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { UserService } from 'src/user/user.service';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    private readonly userService: UserService,
    private cls: ClsService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest() as Request & {
      session: any;
    };

    if (!request.session?.userId) {
      throw new UnauthorizedException('Ви не авторизовані');
    }

    const user = await this.userService.findById(request.session.userId);

    if (!user) {
      throw new UnauthorizedException('Користувач не знайдений');
    }

    request.user = user;
    this.cls.set('user', user);
    return true;
  }
}
