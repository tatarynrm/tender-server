import { Body, Controller, Post } from '@nestjs/common';
import { IctDriversCabinetService } from './ict-drivers-cabinet.service';

@Controller('ict-drivers-cabinet')
export class IctDriversCabinetController {
  constructor(
    private readonly ictDriversCabinetService: IctDriversCabinetService,
  ) {}

  @Post('main')
  async getMainPageInfo(@Body() kod:number) {
    return this.ictDriversCabinetService.getMainPageInfo(kod);
  }
}
