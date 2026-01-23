import { Controller, Get, Query } from '@nestjs/common';
import { StatisticService } from './statistic.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Authorization()
@Controller('crm/statistic')
export class StatisticController {
  constructor(private readonly statisticService: StatisticService) {}

  @Get('stats')
  public async getLogisticDashboardStatistic(@Query() query: any) {
    // query може містити фільтри, наприклад: ?startDate=2023-01-01
    return await this.statisticService.getLogisticDashboardStatistic(query);
  }
}
