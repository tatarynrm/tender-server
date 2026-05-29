import { Controller, Get } from '@nestjs/common';
import { SystemsService } from './systems.service';

@Controller('systems')
export class SystemsController {
  constructor(private readonly systemsService: SystemsService) {}

  @Get('meeting/current')
  getCurrentMeeting() {
    return this.systemsService.getActiveMeeting() || { active: false };
  }
}
