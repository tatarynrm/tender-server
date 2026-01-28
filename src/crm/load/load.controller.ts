// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Patch,
//   Param,
//   Delete,
//   Query,
//   Req,
// } from '@nestjs/common';
// import { LoadService } from './load.service';
// import { CreateLoadDto } from './dto/create-load.dto';
// import { UpdateLoadDto } from './dto/update-load.dto';
// import { Authorization } from 'src/auth/decorators/auth.decorator';
// import type { Request } from 'express';
// import { CrmLoadListDto } from './dto/crm-load-list.dto';
// import { ApiOperation, ApiTags } from '@nestjs/swagger';
// @ApiTags('CRM Loads')
// @Authorization()
// @Controller('crm/load')
// export class LoadController {
//   constructor(private readonly loadService: LoadService) {}

//   @Get('list')
//   @ApiOperation({ summary: 'Отримати список вантажів з фільтрацією' })
//   getList(@Query() query: CrmLoadListDto) {
//     // Тепер query.page та query.limit гарантовано будуть числами (number)
//     return this.loadService.getList(query);
//   }
//   @Post('save')
//   create(@Body() dto: any) {
//     return this.loadService.save(dto);
//   }
//   @Post('add-cars')
//   addCars(@Body() dto: any) {
//     return this.loadService.addCars(dto);
//   }
//   @Post('remove-cars')
//   removeCars(@Body() dto: any) {
//     return this.loadService.removeCars(dto);
//   }
//   @Post('close-cargo-by-manager')
//   closeByManager(@Body() dto: any) {
//     console.log(dto, 'DTO!!!!!!!!!!!!!!!!!!!');

//     return this.loadService.closeByManager(dto);
//   }
//   @Get('load-history/:id')
//   cargoHistory(@Param('id') id: string) {
//     return this.loadService.cargoHistory(id);
//   }
//   @Post('load-history/delete')
//   async loadHistoryDelete(@Body() dto: { id: number; table: string }) {
//     return await this.loadService.loadHistoryDelete(dto);
//   }

//   // Зберегти коментар
//   @Post('save-comment')
//   saveLoadComment(@Body() dto: any, @Req() req: Request) {
//     return this.loadService.saveComment(dto, req);
//   }

//   @Delete('delete-comment/:id')
//   deleteComment(
//     @Param('id') commentId: number,
//     @Body() dto: { id_crm_load: number },
//     @Req() req: Request,
//   ) {
//     return this.loadService.deleteComment(commentId, dto.id_crm_load, req);
//   }

//   @Get('comments/:id')
//   getComments(@Param('id') id: string) {
//     return this.loadService.getComments(id);
//   }
//   @Post('comments/mark-as-read')
//   markAsRead(@Body() dto: any) {
//     return this.loadService.setAsRead(dto);
//   }
//   @Post('load-update')
//   loadUpdate(@Body() dto: any) {
//     return this.loadService.loadUpdate(dto);
//   }
//   @Post('load-copy')
//   loadCopy(@Body() dto: any) {
//     return this.loadService.loadCopy(dto);
//   }

//   // @Get('edit/:id')
//   // findOne(@Param('id') id: string) {
//   //   return this.loadService.findOne(+id);
//   // }
//   @Get('one/:id')
//   getOneLoad(@Param() params: any) {
//     const id = params.id;
//     return this.loadService.getOneLoad(Number(id));
//   }
//   @Delete('delete/:id')
//   loadDelete(@Param() params: any) {
//     console.log(params, 'params delete');

//     const id = params.id;
//     return this.loadService.loadDelete(Number(id));
//   }
// }
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { LoadService } from './load.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { CrmLoadListDto } from './dto/crm-load-list.dto';

@ApiTags('CRM Loads')
@Authorization()
@Controller('crm/load')
export class LoadController {
  constructor(private readonly loadService: LoadService) {}

  // --- Основні CRUD операції ---

  @Get('list')
  @ApiOperation({ summary: 'Отримати список вантажів з фільтрацією' })
  getList(@Query() query: CrmLoadListDto) {
    return this.loadService.getList(query);
  }

  @Get('one/:id')
  @ApiOperation({ summary: 'Отримати деталі одного вантажу' })
  getOneLoad(@Param('id', ParseIntPipe) id: number) {
    return this.loadService.getOneLoad(id);
  }

  @Post('save')
  @ApiOperation({ summary: 'Створити новий вантаж' })
  create(@Body() dto: CreateLoadDto) {
    return this.loadService.save(dto);
  }

  @Post('load-update')
  @ApiOperation({ summary: 'Оновити існуючий вантаж' })
  loadUpdate(@Body() dto: UpdateLoadDto) {
    return this.loadService.loadUpdate(dto);
  }

  @Delete('delete/:id')
  @ApiOperation({ summary: 'Видалити вантаж' })
  loadDelete(@Param('id', ParseIntPipe) id: number) {
    return this.loadService.loadDelete(id);
  }

  // --- Робота з машинами та статусами ---

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
    return this.loadService.closeByManager(dto);
  }

  @Post('load-copy')
  loadCopy(@Body() dto: any) {
    return this.loadService.loadCopy(dto);
  }

  // --- Історія змін ---

  @Get('load-history/:id')
  cargoHistory(@Param('id') id: string) {
    return this.loadService.cargoHistory(id);
  }

  @Post('load-history/delete')
  async loadHistoryDelete(@Body() dto: { id: number; table: string }) {
    return await this.loadService.loadHistoryDelete(dto);
  }

  // --- Коментарі ---

  @Get('comments/:id')
  getComments(@Param('id') id: string) {
    return this.loadService.getComments(id);
  }

  @Post('save-comment')
  saveLoadComment(@Body() dto: any, @Req() req: Request) {
    return this.loadService.saveComment(dto, req);
  }

  @Post('comments/mark-as-read')
  markAsRead(@Body() dto: any) {
    return this.loadService.setAsRead(dto);
  }

  @Delete('delete-comment/:id')
  deleteComment(
    @Param('id', ParseIntPipe) commentId: number,
    @Body() dto: { id_crm_load: number },
    @Req() req: Request,
  ) {
    return this.loadService.deleteComment(commentId, dto.id_crm_load, req);
  }
}
