import { Module } from '@nestjs/common';
import { OraIctService } from './ora-ict.service';
import { OraIctController } from './ora-ict.controller';
import { IctDriversCabinetModule } from './ict-drivers-cabinet/ict-drivers-cabinet.module';

@Module({
  controllers: [OraIctController],
  providers: [OraIctService],
  imports: [IctDriversCabinetModule],
})
export class OraIctModule {}
