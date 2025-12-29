import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TenderService } from './tender.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Authorization()
@Controller('tender')
export class TenderController {
  constructor(private readonly tenderService: TenderService) {}

  // Тендер CRM
  @Get('list')
  getList(@Body() dto: any) {
    return this.tenderService.getList(dto);
  }

  // DASHBOARD
  @Get('client-list')
  getClientsList(@Query() query:any) {
    return this.tenderService.getClientList(query);
  }
  @Post('save')
  save(@Body() dto: any) {
    return this.tenderService.save(dto);
  }

  // Тендер CRM

  @Post('set-rate')
  tenderSetRate(@Body() dto: any) {
    console.log('dto',dto,'dto----');
    
    return this.tenderService.tenderSetRate(dto);
  }
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.tenderService.getOne(id);
  }
}
