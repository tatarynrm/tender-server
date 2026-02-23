import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { AdminUserService } from './admin-user.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Authorization()
@Controller('')
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  @Get('pre-register/list')
  public async getAllPreRegisterUsers(@Query() query: any) {
    return this.adminUserService.getAllPreRegisterUsers(query);
  }

  @Get('list')
  getAdminUserList(@Query() query: any) {
    return this.adminUserService.getAdminUserList(query);
  }

  @Post('save')
  adminCreateUser(@Body() dto: any) {
    return this.adminUserService.adminUserSave(dto);
  }
  @Get('one/:id')
  getOneUser(@Param('id') id: string) {
    // Використовуємо @Param замість @Query
    return this.adminUserService.getAdminOneUser(id);
  }

    @Get('pre/:id')
  async getUserPre(@Param('id') id: string) {
    // query тепер містить всі ваші фільтри та пагінацію
    return this.adminUserService.getUserPre(Number(id));
  }
}
