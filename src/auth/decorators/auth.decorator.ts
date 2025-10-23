import { applyDecorators, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../guards/auth.guard';
interface UserRole {}

export function Authorization(...roles: UserRole[] | any) {
  if (roles.length > 0) {
    return applyDecorators(UseGuards(AuthGuard));
  }

  return applyDecorators(UseGuards(AuthGuard));
}
