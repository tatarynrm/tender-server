import { Body, Controller, Get, Post } from '@nestjs/common';
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
  @Get('test')
  async testDeploy(@Body() kod:number) {
    return this.ictDriversCabinetService.getMainPageInfo(kod);
  }
}
