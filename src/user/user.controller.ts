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
    return this.userService.findById(userId);
  }
  // -------------------------------------------------------------------------
  // ADMIN КОНТРАГЕТНТА
  // Список усії працівників компанії
  @Get('all')
  public async getAllUsersFromCompany(@Body() body: any) {
    const pagination = body.pagination || {
      page_num: 1,
      page_rows: 10,
    };

    const filter = body.filter || [];
    const sort = body.sort || null;

    return this.userService.getAllUsers({ pagination, sort, filter });
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
  @Get('deploy')
  public async testDeploy() {
    return {
      message: 'DEPLOY SUCCESFULLsssssss',
    };
  }
  // Створити користувача з форми PreRegister
  @Post('pre-register-user-create')
  public async createPreRegisterUser(
    @Req() req: Request,
    @Body() dto: UserRegisterFromPreDto,
  ) {
    return this.userService.createPreRegisterUser(dto);
  }

  // Заливка форми даними PreRgisterCompany
  @Authorization()
  @Post('company-fill')
  public async companyFillFromUsrPreRegister(
    @Body() dto: CompanyFillPreRegister,
  ) {
    return this.userService.companyFillFromUsrPreRegister(dto);
  }
  @Authorization()
  @Post('admin/create-user')
  public async adminCreateUser(
    @Req() req: Request,
    @Body()
    dto: CreateUserFromCompany & { id_company: number },
  ) {
    return this.userService.adminCreateUser(dto);
  }
}
