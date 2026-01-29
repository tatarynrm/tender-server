import { Module } from '@nestjs/common';
import { SystemsService } from './systems.service';
import { SystemsController } from './systems.controller';
import { SystemGateway } from './systems.gateaway';
import { AdminSystemController } from './admin-system.controller';

@Module({
  controllers: [SystemsController,AdminSystemController],
  providers: [SystemsService,SystemGateway],
})
export class SystemsModule {}
