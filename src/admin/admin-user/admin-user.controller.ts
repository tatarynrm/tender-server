import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { AdminUserService } from './admin-user.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { Authorized } from 'src/auth/decorators/authorized.decorator';
import { UserActivityService } from './user-activity.service';
import type { Request } from 'express';

@Authorization()
@Controller('')
export class AdminUserController {
  constructor(
    private readonly adminUserService: AdminUserService,
    private readonly userActivityService: UserActivityService,
  ) {}

  @Get('pre-register/list')
  public async getAllPreRegisterUsers(@Query() query: any) {
    return this.adminUserService.getAllPreRegisterUsers(query);
  }

  @Get('list')
  getAdminUserList(@Query() query: any) {
    return this.adminUserService.getAdminUserList(query);
  }

  @Get('online-list')
  getOnlineAdminUsersList(@Query() query: any) {
    return this.adminUserService.getOnlineAdminUsers(query);
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

  @Get('test-list')
  async getTestList() {
    const res = await this.adminUserService.getAdminUserList({ filter: { id: '6' } });
    const fs = require('fs');
    fs.writeFileSync('debug-usr-list.json', JSON.stringify(res, null, 2));
    return res;
  }

    @Get('pre/:id')
  async getUserPre(@Param('id') id: string) {
    // query тепер містить всі ваші фільтри та пагінацію
    return this.adminUserService.getUserPre(Number(id));
  }

  @Post('delete')
  adminDeleteUser(@Body('id') id: string) {
    return this.adminUserService.adminDeleteUser(id);
  }

  @Post('pre-register/register')
  registerFromPre(@Body() dto: any) {
    return this.adminUserService.registerFromPre(dto);
  }

  @Get('ict-activity-summary')
  async getIctActivitySummary() {
    return this.userActivityService.getIctManagersActivitySummary();
  }

  @Get(':id/activities')
  async getUserActivities(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userActivityService.getUserActivities(
      Number(id),
      cursor,
      limit ? Number(limit) : 20,
    );
  }

  @Post('impersonate')
  async impersonateCompany(
    @Authorized('id') userId: string,
    @Body('id_company') newCompanyId: number,
    @Req() req: Request,
  ) {
    return this.adminUserService.impersonateCompany(Number(userId), newCompanyId, req);
  }
}
