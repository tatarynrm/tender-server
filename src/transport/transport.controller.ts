import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { TransportService } from './transport.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { GetTransportQueryDto } from './dto/get-transport-query.dto';
@Authorization()
@Controller('transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}
  @Post('page-info')
  public async pageInfo(@Req() req: Request, @Body() dto: any) {
    return this.transportService.pageInfo(dto);
  }

  @Get('list')
  async getList(@Query() query: GetTransportQueryDto) {
    const data = await this.transportService.transportList(query);
    return data
  }
}
