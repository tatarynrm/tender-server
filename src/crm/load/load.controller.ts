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
    console.log(dto,'DTO!!!!!!!!!!!!!!!!!!!');
    
    return this.loadService.closeByManager(dto);
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
