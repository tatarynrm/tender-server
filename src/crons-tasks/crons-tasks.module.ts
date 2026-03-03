import { Module } from '@nestjs/common';
import { TenderCronService } from './services/tender-cron.service';

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
  
  ],
  exports:[CronTasksModule]
})
export class CronTasksModule {}