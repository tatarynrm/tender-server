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
import { AdminCreateCompanyDto } from './dto/admin-create-company.dto copy';

@Authorization()
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post('create')
  create(@Body() createCompanyDto: CreateCompanyDto) {
    console.log(createCompanyDto, 'DTOOOOOOOOOOOO');

    return this.companyService.create(createCompanyDto);
  }

  @Post('all')
  findAll(@Body() body: any) {
   const pagination = body.pagination || {
      page_num: 1,
      page_rows: 10,
    };

    const filter = body.filter || [];
    const sort = body.sort || null;

    return this.companyService.findAll({ pagination, filter, sort });
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

  @Get('name/:name')
  searchCompanyByName(@Param('name') name: string) {
    return this.companyService.searchCompanyByName(name);
  }

  @Post('admin/create')
  adminCreate(@Body() dto: AdminCreateCompanyDto) {
    return this.companyService.adminCreate(dto);
  }
}
