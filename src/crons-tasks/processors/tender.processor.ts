import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { TenderGateway } from 'src/tender/tender.gateway';

@Processor('tender-tasks')
export class TenderProcessor extends WorkerHost {
  private readonly logger = new Logger(TenderProcessor.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly tenderGateway: TenderGateway,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'update-tender-timer':
        return this.handleTenderTimerUpdate();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleTenderTimerUpdate() {
    this.logger.debug('🚀 [SCALABLE] Починаємо оновлення часу тендеру');
    let client;

    try {
      client = await this.databaseService.getClient();
      const result = await client.query(`CALL tender_timer($1)`, [{}]);

      if (result.rows && result.rows.length > 0) {
        this.tenderGateway.emitToAll('tender_status_updated', result.rows[0]);
        this.logger.log('✅ Статус тендерів оновлено успішно');
      }

      return { status: 'success' };
    } catch (error) {
      this.logger.error('❌ Помилка в scalable-cron процесорі', error.stack);
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }
}
