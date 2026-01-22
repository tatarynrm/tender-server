import {
  Controller,
  Post,
  Body,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { AdminUserService } from './admin-user.service';
import type { Request } from 'express';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('ADMIN USER CONTROLL')
@Authorization()
@Controller() // Залиште ПОРОЖНІМ, RouterModule все зробить за вас
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}
  @ApiOperation({ summary: 'Отримати список CRM' })
  @ApiResponse({ status: 200, description: 'Успішно отримано' })
  @Post('create') // Тепер це точно POST /admin/user/create
  public async createUser(
    @Req() req: Request,
    @Body() dto: AdminCreateUserDto,
  ) {
    return this.adminUserService.createUser(dto);
  }
}
