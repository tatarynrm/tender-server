import { Controller, Post, Body } from '@nestjs/common'; // Змінено Get -> Post, Query -> Body
import { StatisticService } from './statistic.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Authorization()
@Controller('crm/statistic')
export class StatisticController {
  constructor(private readonly statisticService: StatisticService) {}

  @Post('stats') // Змінено з @Get на @Post
  public async getCrmLoadStatistic(@Body() filters: any) { 
    // Тепер фільтри приходять з Body запиту (payload)
    // Це набагато стабільніше для SPA-клієнта
    return await this.statisticService.getCrmLoadStatistic(filters);
  }
}