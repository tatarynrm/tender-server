import { Body, Controller, Get, Param } from '@nestjs/common';
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
  @Get(':id')
  getOne(@Param('id') id: string) {
    console.log(id,'IDDDDDDDDDDDD');
    
    return this.tenderService.getOne(id);
  }











 // Тендер CRM
}
