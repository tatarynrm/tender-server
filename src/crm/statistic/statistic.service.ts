import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class StatisticService {
  public constructor(private readonly dbservice: DatabaseService) {}

  public async getCrmLoadStatistic(filters: any = {}) {
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
  public async getCrmLoadStatisticCountry(filters: any = {}) {
    console.log(filters, 'filters 26');
    const { startDate, endDate,id_usr } = filters;


    try {
      // Викликаємо процедуру для отримання статистики
      const result = await this.dbservice.callProcedure(
        'crm_load_statistic_country',
        { date1: startDate, date2: endDate,id_usr:id_usr }, // Передаємо фільтри, якщо процедура їх приймає (наприклад, { userId: 1 })
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
