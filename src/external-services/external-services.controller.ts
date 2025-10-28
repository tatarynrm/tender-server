import { Controller } from '@nestjs/common';
import { ExternalServicesService } from './external-services.service';

@Controller('external-services')
export class ExternalServicesController {
  constructor(
    private readonly externalServicesService: ExternalServicesService,
  ) {}
}
