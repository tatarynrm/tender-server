import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { DatabaseService } from 'src/database/database.service';

@Processor('currency-tasks')
export class CurrencyProcessor extends WorkerHost {
  private readonly logger = new Logger(CurrencyProcessor.name);

  constructor(private readonly databaseService: DatabaseService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'fetch-nbu-rates':
        return this.handleFetchRates();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleFetchRates() {
    this.logger.debug('🚀 [SCALABLE] Fetching currency rates from NBU...');
    try {
      const url = `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json`;
      const { data } = await axios.get(url);

      this.logger.log(`Отримано ${data.length} курсів валют від НБУ`);

      // 🛠 Трансформація даних під формат вашої БД
      const mappedData = data.map((item: any) => {
        const [d, m, y] = item.exchangedate.split('.');
        return {
          date_rate: `${y}-${m}-${d}`, // Формат YYYY-MM-DD
          ids_valut: item.cc,
          rate: item.rate,
        };
      });

      await this.saveRatesToDb(mappedData);

      return { status: 'success', count: mappedData.length };
    } catch (error) {
      this.logger.error('❌ Помилка при отриманні курсів валют', error.message);
      throw error;
    }
  }

  private async saveRatesToDb(data: any[]) {
    try {
      // Повертаємо stringify, бо процедура run очікує JSON-рядок для внутрішнього парсингу
      await this.databaseService.callProcedure(
        'valut_rate_set_by_array',
        JSON.stringify(data),
        {},
      );
      this.logger.log(
        '💵💵💵💵💵💵💵 Курс валют успішно збережено в БД через процедуру',
      );
    } catch (error) {
      this.logger.error('Помилка при збереженні курсів у БД', error.message);
      throw error;
    }
  }
}
