import { Module } from '@nestjs/common';
import { IctDriversCabinetService } from './ict-drivers-cabinet.service';
import { IctDriversCabinetController } from './ict-drivers-cabinet.controller';

@Module({
  controllers: [IctDriversCabinetController],
  providers: [IctDriversCabinetService],
})
export class IctDriversCabinetModule {}
