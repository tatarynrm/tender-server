import { Module } from '@nestjs/common';
import { TenderCronService } from './services/tender-cron.service';
import { TenderGateway } from 'src/tender/tender.gateway';

// import { UsersModule } from '../users/users.module';

@Module({
  // Якщо вашим крон-сервісам потрібні інші модулі (наприклад, для роботи з БД), 
  // імпортуйте їх сюди:
  imports: [
    // UsersModule,
    // EmailsModule
  ],
  // Реєструємо всі наші крон-сервіси як провайдери
  providers: [
    TenderCronService,
    TenderGateway
  
  ],
  exports:[CronTasksModule]
})
export class CronTasksModule {}