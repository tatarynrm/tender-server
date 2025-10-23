import { Controller } from '@nestjs/common';
import { IctDriversCabinetService } from './ict-drivers-cabinet.service';

@Controller('ict-drivers-cabinet')
export class IctDriversCabinetController {
  constructor(private readonly ictDriversCabinetService: IctDriversCabinetService) {}
}
