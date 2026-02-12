import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class StatisticService {
  public constructor(private readonly dbservice: DatabaseService) {}

  public async getCrmLoadStatistic(filters: any = {}) {
    // Якщо клієнт не надіслав нічого, filters буде порожнім об'єктом {}
    console.log('Received filters for POST request:', filters);

    try {
      // Передаємо об'єкт filters безпосередньо в процедуру БД
      const result = await this.dbservice.callProcedure(
        'crm_load_statistic',
        filters,
        {},
      );
      console.log(result, 'RESULT');

      // Повертаємо контент або порожній об'єкт (важливо для фронтенда)
      return (
        result.content || {
          car_actual: [],
          car_closed: [],
          car_published: [],
          chart_clients: [],
          chart_countries: [],
        }
      );
    } catch (error) {
      console.error('Error fetching CRM statistics via POST:', error);
      throw error;
    }
  }
}
