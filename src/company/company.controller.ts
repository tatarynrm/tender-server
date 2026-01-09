import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';

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

  @Get('all')
  async findAll(@Query() query: any) {
    console.log('1111');
    
    console.log(query,'QUERY');
    
    // query тепер містить всі ваші фільтри та пагінацію
    return this.companyService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companyService.findOne(+id);
  }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto) {
  //   return this.companyService.update(+id, updateCompanyDto);
  // }

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
