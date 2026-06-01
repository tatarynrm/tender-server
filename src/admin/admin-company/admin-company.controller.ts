import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AdminCompanyService } from './admin-company.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { UserActivityService } from 'src/admin/admin-user/user-activity.service';

@Authorization()
@Controller('')
export class AdminCompanyController {
  constructor(
    private readonly adminCompanyService: AdminCompanyService,
    private readonly userActivityService: UserActivityService,
  ) {}

  @Get(':id/activities')
  async getCompanyActivities(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userActivityService.getCompanyActivities(
      Number(id),
      cursor,
      limit ? Number(limit) : 20,
    );
  }

  @Get(':id/activities/summary')
  async getCompanyActivitiesSummary(@Param('id') id: string) {
    return this.userActivityService.getCompanyManagersActivitySummary(Number(id));
  }

  @Get('all')
  async findAll(@Query() query: any) {
    // query тепер містить всі ваші фільтри та пагінацію
    return this.adminCompanyService.findAll(query);
  }

  @Post('save')
  async saveCompany(@Body() dto: any) {
    // query тепер містить всі ваші фільтри та пагінацію
    return this.adminCompanyService.saveCompany(dto);
  }

  @Get('one/:id')
  async findOne(@Param('id') id: string) {
    // query тепер містить всі ваші фільтри та пагінацію
    return this.adminCompanyService.findOne(Number(id));
  }
  @Get('pre/:id')
  async getCompanyPre(@Param('id') id: string) {
    // query тепер містить всі ваші фільтри та пагінацію
    return this.adminCompanyService.getCompanyPre(Number(id));
  }
}
