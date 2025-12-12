import { Body, Controller, Post, Req } from '@nestjs/common';
import { TransportService } from './transport.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';
@Authorization()
@Controller('transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}
  @Post('list')
  public async transportList(@Req() req: Request, @Body() dto: any) {
    return this.transportService.transportList();
  }
}
