import { Body, Controller, Get, Param, Post, Query, Session, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { TenderService } from './tender.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';
// import { TenderSaveDto } from './interfaces/tender-save.interface';

@Authorization()
@Controller('tender')
export class TenderController {
  constructor(private readonly tenderService: TenderService) { }

  // Тендер CRM
  @Get('list')
  getList(@Query() query: any) {
    return this.tenderService.getList(query);
  }
  @Post('set-status')
  tenderSetStatus(@Body() dto: any) {
    return this.tenderService.tenderSetStatus(dto);
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
  @UseInterceptors(FilesInterceptor('files'))
  async save(
    @Body() body: { dto?: string;[key: string]: any },
    @UploadedFiles() files: Express.Multer.File[],
    @Session() session: any
  ) {
    console.log('--- REQUEST REACHED TENDER CONTROLLER ---');
    console.log('Body keys:', Object.keys(body || {}));
    console.log('Files count:', files?.length || 0);

    /**
     * Reverting to any temporarily as requested.
     */
    const processedDto: any = typeof body.dto === 'string'
      ? JSON.parse(body.dto)
      : (body.dto || body);

    const companyId = session?.id_company || null;
    return this.tenderService.save(processedDto, files, companyId);
  }

  // Тендер CRM

  @Post('set-rate')
  tenderSetRate(@Body() dto: any) {
    return this.tenderService.tenderSetRate(dto);
  }
  @Post('set-winner')
  tenderSetWinner(@Body() dto: any) {
    return this.tenderService.tenderSetWinner(dto);
  }
  @Post('del-winner')
  tenderDelWinner(@Body() dto: any) {
    return this.tenderService.tenderDelWinner(dto);
  }
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.tenderService.getOne(id);
  }


}
