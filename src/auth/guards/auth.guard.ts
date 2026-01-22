import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { UserService } from 'src/user/user.service';
import type { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    private readonly userService: UserService,
    private cls: ClsService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
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
