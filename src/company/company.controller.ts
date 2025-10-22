import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Query,
  ParseIntPipe,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import type { Request, Response } from 'express';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Authorization()
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post('create')
  create(@Body() createCompanyDto: CreateCompanyDto) {
    console.log(createCompanyDto, 'DTOOOOOOOOOOOO');

    return this.companyService.create(createCompanyDto);
  }

  @Get('all')
  findAll() {
    console.log('dsdsd');
    
    return this.companyService.findAll();
  }
  @Get('all-stuff')
  findAllStuff() {
    return this.companyService.findAll();
  }
  @Get('noris')
  findAllStufff() {
    return this.companyService.findAll();
  }
  @Get('my-company')
  findMyCompany(@Req() req: Request) {
    return this.companyService.findMyCompany(req);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companyService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto) {
    return this.companyService.update(+id, updateCompanyDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.companyService.remove(+id);
  }

}
