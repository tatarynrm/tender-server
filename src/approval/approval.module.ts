import { Module } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';

// Навмисно не імпортує TelegramModule: бот береться через @InjectBot із
// глобального TelegrafModule.forRoot, а TelegramModule сам імпортує цей —
// інакше вийшов би цикл.
@Module({
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
