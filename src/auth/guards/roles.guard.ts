// import {
//   Injectable,
//   CanActivate,
//   ExecutionContext,
//   ForbiddenException,
// } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';


// import { ROLES_KEY } from '../decorators/roles.decorator';

// @Injectable()
// export class RolesGuard implements CanActivate {
//   public constructor(private readonly reflector: Reflector) {}
//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
//       context.getClass(),
//       context.getHandler(),
//     ]);
//     const request = context.switchToHttp().getRequest();

//     if (!roles) {
//       return true;
//     }

//     if (!roles.includes(request.user.role)) {
//       throw new ForbiddenException('У вас недостатньо прав доступу');
//     }

//     return true;
//   }
// }
