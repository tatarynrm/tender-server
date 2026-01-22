import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { LoadService } from './load.service';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import type { Request } from 'express';
import { CrmLoadListDto } from './dto/crm-load-list.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
@ApiTags('CRM Loads')
@Authorization()
@Controller('crm/load')
export class LoadController {
  constructor(private readonly loadService: LoadService) {}

  @Get('list')
  @ApiOperation({ summary: 'Отримати список вантажів з фільтрацією' })
  getList(@Query() query: CrmLoadListDto) {
    // Тепер query.page та query.limit гарантовано будуть числами (number)
    return this.loadService.getList(query);
  }
  @Post('save')
  create(@Body() dto: any) {
    return this.loadService.save(dto);
  }
  @Post('add-cars')
  addCars(@Body() dto: any) {
    return this.loadService.addCars(dto);
  }
  @Post('remove-cars')
  removeCars(@Body() dto: any) {
    return this.loadService.removeCars(dto);
  }
  @Post('close-cargo-by-manager')
  closeByManager(@Body() dto: any) {
    console.log(dto, 'DTO!!!!!!!!!!!!!!!!!!!');

    return this.loadService.closeByManager(dto);
  }
  @Get('load-history/:id')
  cargoHistory(@Param('id') id: string) {
    return this.loadService.cargoHistory(id);
  }
  // Зберегти коментар
  @Post('save-comment')
  saveLoadComment(@Body() dto: any, @Req() req: Request) {
    return this.loadService.saveComment(dto, req);
  }
  @Get('comments/:id')
  getComments(@Param('id') id: string) {
    return this.loadService.getComments(id);
  }
  @Post('comments/mark-as-read')
  markAsRead(@Body() dto: any) {
    return this.loadService.setAsRead(dto);
  }
  @Post('load-update')
  loadUpdate(@Body() dto: any) {
    return this.loadService.loadUpdate(dto);
  }
  @Post('load-copy')
  loadCopy(@Body() dto: any) {
    return this.loadService.loadCopy(dto);
  }

  @Get('edit/:id')
  findOne(@Param('id') id: string) {
    return this.loadService.findOne(+id);
  }
  @Get('one/:id')
  getOneLoad(@Param() params: any) {
    const id = params.id;
    return this.loadService.getOneLoad(Number(id));
  }
}
