import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface User  {

}
export const Authorized = createParamDecorator(
  (data: keyof User | any, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // console.log(user,'USER1111111111');

    return data ? user[data] : user;
  },
);
