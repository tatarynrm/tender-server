import { Module } from '@nestjs/common';
import { ExternalServicesService } from './external-services.service';
import { ExternalServicesController } from './external-services.controller';
import { NominatimModule } from './nominatim/nominatim.module';

@Module({
  controllers: [ExternalServicesController],
  providers: [ExternalServicesService],
  imports: [NominatimModule],
})
export class ExternalServicesModule {}
