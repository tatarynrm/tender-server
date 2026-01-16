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
import { LoadService } from './load.service';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Authorization()
@Controller('crm/load')
export class LoadController {
  constructor(private readonly loadService: LoadService) {}

  @Get('list')
  getList(@Query() query: any) {
    return this.loadService.getList(query);
  }
  @Post('save')
  create(@Body() dto: any) {
    return this.loadService.save(dto);
  }

  @Get('edit/:id')
  findOne(@Param('id') id: string) {
    return this.loadService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateLoadDto: UpdateLoadDto) {
    return this.loadService.update(+id, updateLoadDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.loadService.remove(+id);
  }
}
