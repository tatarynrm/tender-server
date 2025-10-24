import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import type { Request, Response as ExpressResponse } from 'express';
import { LoginDto } from './dto/login.dto';
import { Recaptcha } from '@nestlab/google-recaptcha';
import { AuthProviderGuard } from './guards/provider.guard';
import { ConfigService } from '@nestjs/config';
import { ProviderService } from './provider/provider.service';
import type { RedisClientType } from 'redis';
import { PreRegisterDto } from './dto/pre-register.dto';
import { RegisterIctUserDto } from './dto/register-ict-user.dto';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserService } from 'src/user/user.service';
interface SessionMeta {
  id: string;
  ip?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  device?: string;
  createdAt?: string;
}

@Controller('auth')
export class AuthController {
  public constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType, // ✅ типізація
  ) {}

  // @Recaptcha()
  @Post('register')
  @HttpCode(HttpStatus.OK)
  public async register(@Req() req: Request, @Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
  // @Recaptcha()
  @Post('pre-register')
  @HttpCode(HttpStatus.OK)
  public async preRegister(@Req() req: Request, @Body() dto: PreRegisterDto) {
    return this.authService.preRegister(dto);
  }
  @Post('register-ict-user')
  @HttpCode(HttpStatus.OK)
  public async registerIctUser(
    @Req() req: Request,
    @Body() dto: RegisterIctUserDto,
  ) {
    console.log(dto, 'DTO');

    return this.authService.registerIctUser(dto);
  }
  // @Recaptcha()
  @Post('login')
  @Throttle({ default: { limit: 3, ttl: 10000 } }) // 5 requests per 10 seconds
  @HttpCode(HttpStatus.OK)
  public async login(@Req() req: Request, @Body() dto: LoginDto) {
    console.log(dto, 'DTO LOGIN CONTROLLER');

    return this.authService.login(req, dto);
  }

  @Get('registerFormData')
  @HttpCode(HttpStatus.OK)
  public async registerFormData() {
    return this.authService.registerFormData();
  }

  // @Get('/oauth/callback/:provider')
  // @UseGuards(AuthProviderGuard)
  // public async callback(
  //   @Req() req: Request,
  //   @Res({ passthrough: true }) res: Response,
  //   @Query('code') code: string,
  //   @Param('provider') provider: string,
  // ) {
  //   if (!code) {
  //     throw new BadRequestException('Немає коду авторизації');
  //   }

  //   await this.authService.extractProfileFromCode(req, provider, code);

  //   return res.redirect(
  //     `${this.configService.getOrThrow<string>('ALLOWED_ORIGIN')}/dashboard`,
  //   );
  // }

  // @UseGuards(AuthProviderGuard)
  // @Get('/oauth/connect/:provider')
  // @HttpCode(HttpStatus.OK)
  // public async connect(@Param('provider') provider: string) {
  //   const providerInstance = this.providerService.findByService(provider);
  //   return {
  //     url: providerInstance?.getAuthUrl(),
  //   };
  // }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  public async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    return this.authService.logout(req, res);
  }

  @Get('check-session')
  public async checkSession(@Req() req: Request) {
    if (!req.session?.userId) {
      throw new UnauthorizedException('Сесія не знайдена або закінчилась');
    }
    console.log(req.session.userId, 'USER ID ----- 129  line auth controller');

    return { ok: true };
  }

  @Get('sessions')
  async getUserSessions(@Req() req: Request) {
    const sessionPrefix =
      this.configService.get<string>('SESSION_FOLDER') || '';
    const keys = await this.redisClient.keys(`${sessionPrefix}*`);

    const sessions: SessionMeta[] = [];
    let currentSession: SessionMeta | null = null;

    for (const key of keys) {
      const raw = await this.redisClient.get(key);
      if (!raw) continue;
      const session = JSON.parse(raw);
      if (session.userId === req.session.userId) {
        const meta: SessionMeta = {
          id: key.replace(sessionPrefix, ''),
          ...session.meta,
        };
        if (key === `${sessionPrefix}${req.sessionID}`) {
          currentSession = meta;
        } else {
          sessions.push(meta);
        }
      }
    }

    return {
      current: currentSession,
      others: sessions,
    };
  }

  @Delete('sessions/:id')
  async deleteSession(@Req() req: Request, @Param('id') id: string) {
    const sessionPrefix =
      this.configService.get<string>('SESSION_FOLDER') || '';
    const fullKey = `${sessionPrefix}${id}`;
    const raw = await this.redisClient.get(fullKey);

    if (!raw) {
      return { ok: false, message: 'Сесія не знайдена' };
    }

    const session = JSON.parse(raw);
    console.log(session, 'SESSION');
    if (session.userId !== req.session.userId) {
      return { ok: false, message: 'Доступ заборонено' };
    }

    await this.redisClient.del(fullKey);
    return { ok: true };
  }

  // @Get('me')
  // async getProfile(@Req() req: Request, @Res() res: ExpressResponse) {
  //   const sessionUser = req.session?.userId;
  //   console.log(sessionUser, 'sessionUser');

  //   if (!sessionUser) {
  //     // Видалення cookie
  //     res.cookie('centrifuge', '', { maxAge: 0, path: '/', httpOnly: true });

  //     return res.status(401).json({ message: 'authorized', status: 401 });
  //   }

  //   // Отримуємо актуальні дані з бази
  //   const user = await this.userService.findById(sessionUser);

  //   return res.json({
  //     id: user.id,
  //     name: user.name,
  //     email: user.email,
  //     is_admin: user.is_admin,
  //     is_manager: user.is_manager,
  //     is_director: user.is_director,
  //     ict: user.ict,
  //     is_ict: user.is_ict,
  //     is_blocked: user.is_blocked,
  //   });
  // }

  @Get('me')
  async getProfile(@Req() req: Request) {
    const sessionUser = req.session?.userId;
    console.log(sessionUser,'sessionUser');

    
    if (!sessionUser) {
      req.session.destroy((err) => {
        if (err) console.error(err);
      });
      return { message: 'Unauthorized', status: 401 };
    }

    const user = await this.userService.findById(sessionUser);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      is_admin: user.is_admin,
      is_manager: user.is_manager,
      is_director: user.is_director,
      ict: user.ict,
      is_ict: user.is_ict,
      is_blocked: user.is_blocked,
    };
  }
}
