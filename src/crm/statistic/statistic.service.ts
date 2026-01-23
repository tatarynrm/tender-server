import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class StatisticService {
  public constructor(private readonly dbservice: DatabaseService) {}

  public async getLogisticDashboardStatistic(filters: any = {}) {
    try {
      // Викликаємо процедуру для отримання статистики
      const result = await this.dbservice.callProcedure(
        'crm_load_statistic',
        filters, // Передаємо фільтри, якщо процедура їх приймає (наприклад, { userId: 1 })
        {},
      );
      console.log(result, 'RESULT');

      // Зазвичай процедури повертають масив у полі content
      return result.content || [];
    } catch (error) {
      console.error('Error fetching active user stats:', error);
      throw error;
    }
  }
}
