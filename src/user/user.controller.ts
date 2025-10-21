import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { UserService } from './user.service';

import { Authorized } from 'src/auth/decorators/authorized.decorator';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import type { Request } from 'express';
import { CompanyFillPreRegister } from './dto/company-fill-pre-register.dto';
import { CreateUserFromCompany } from './dto/create-user-from-company.dto';
import { UserRegisterFromPreDto } from './dto/user-register-from-pre.dto';

@Authorization()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @HttpCode(HttpStatus.OK)
  @Get('profile')
  public async findProfile(@Authorized('id') id: string) {
    return this.userService.findById(id);
  }
  // @Authorization(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Get('by-id/:id')
  public async findById(@Param('id') userId: string) {
    return this.userService.findById(userId);
  }

  @Authorization()
  @HttpCode(HttpStatus.OK)
  @Patch('profile')
  public async updateProfile(
    @Authorized('id') userId: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ) {
    return this.userService.update(userId, dto);
  }

  // @Authorization()
  @HttpCode(HttpStatus.OK)
  @Get('profiles')
  public async testUser(@Authorized('id') userId: string) {
    console.log('PROFILE');

    return this.userService.findById(userId);
  }
  // -------------------------------------------------------------------------
  // ADMIN КОНТРАГЕТНТА
  // Список усії працівників компанії
  @Post('all')
  public async getAllUsersForCompany(@Req() req: Request) {
    return this.userService.getAllUsersFromCompany();
  }
  // Компанія реєструє свого працівника !!!!!!!!!!!!!!!!!!!
  @Post('register-from-company')
  public async createOrUpdateUserFromCompany(
    @Req() req: Request,
    @Body() dto: CreateUserFromCompany,
  ) {
    const idCompany = req.session.id_company;
  

    if (!idCompany) {
      throw new BadRequestException('Company ID not found in session');
    }
    return this.userService.createOrUpdateUserFromCompany({
      ...dto,
      id_company: idCompany,
    });
  }

  // --------------------------------------------------------------------
  // ADMIN COMMANDS
  // Cписок усіх зареєстрованих компаній попередньо PreRegister
  @Post('pre-register')
  public async getAllPreRegisterUsers(@Req() req: Request) {
    return this.userService.getAllPreRegisterUsers(req);
  }
  // Створити користувача з форми PreRegister
  @Post('pre-register-user-create')
  public async createPreRegisterUser(@Req() req: Request,@Body() dto:UserRegisterFromPreDto) {
    return this.userService.createPreRegisterUser(dto);
  }

  // Заливка форми даними PreRgisterCompany
  @Authorization()
  @Post('company-fill')
  public async companyFillFromUsrPreRegister(
    @Body() dto: CompanyFillPreRegister,
  ) {
    console.log('---------');

    console.log(dto, 'DTO');

    return this.userService.companyFillFromUsrPreRegister(dto);
  }
}
