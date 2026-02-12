import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TenderService } from './tender.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Authorization()
@Controller('tender')
export class TenderController {
  constructor(private readonly tenderService: TenderService) {}

  // Тендер CRM
  @Get('list')
  getList(@Query() query: any) {
    return this.tenderService.getList(query);
  }

  // DASHBOARD
  @Get('client-list')
  getClientsList(@Query() query: any) {
    return this.tenderService.getClientList(query);
  }
  @Get('client-list-form-data')
  getClientsListFormData(@Query() query: any) {
    return this.tenderService.getClientListFormData(query);
  }
  @Get('list-form-data')
  getListFormData(@Query() query: any) {
    return this.tenderService.getListFormData(query);
  }
  @Post('save')
  save(@Body() dto: any) {
    return this.tenderService.save(dto);
  }

  // Тендер CRM

  @Post('set-rate')
  tenderSetRate(@Body() dto: any) {
    return this.tenderService.tenderSetRate(dto);
  }
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.tenderService.getOne(id);
  }
}
