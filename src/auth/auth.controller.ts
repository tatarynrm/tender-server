import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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


    return this.authService.registerIctUser(dto);
  }
  // @Recaptcha()
  @Post('login')
  @Throttle({ default: { limit: 3, ttl: 10000 } }) // 5 requests per 10 seconds
  @HttpCode(HttpStatus.OK)
  public async login(@Req() req: Request, @Body() dto: LoginDto) {


    return this.authService.login(req, dto);
  }

  @Get('registerFormData')
  @HttpCode(HttpStatus.OK)
  public async registerFormData() {
    return this.authService.registerFormData();
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  public async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    return this.authService.logout(req, res);
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

  @Delete('sessions/current')
  async deleteCurrentSession(@Req() req: Request) {
    const sessionPrefix =
      this.configService.get<string>('SESSION_FOLDER') || '';
    const fullKey = `${sessionPrefix}${req.sessionID}`;
    await this.redisClient.del(fullKey);
    req.session.destroy(() => {});
    return { ok: true };
  }

  @Post('sessions/logout-others')
  async logoutOtherSessions(@Req() req: Request) {
    const sessionPrefix =
      this.configService.get<string>('SESSION_FOLDER') || '';
    const currentSessionId = req.sessionID;
    const userId = req.session.userId;


    const keys = await this.redisClient.keys(`${sessionPrefix}*`);
    const allSessions = await Promise.all(
      keys.map(async (key) => {
        const raw = await this.redisClient.get(key);
        if (!raw) return null;
        const session = JSON.parse(raw);
        return { key, session };
      }),
    );

    // Знаходимо сесії поточного користувача (крім поточної)
    const userSessions = allSessions.filter(
      (item) =>
        item &&
        item.session.userId === userId &&
        item.session.id !== currentSessionId,
    );

    // Видаляємо інші
    await Promise.all(
      userSessions
        .filter((s): s is { key: string; session: any } => s !== null)
        .map((s) => this.redisClient.del(s.key)),
    );

    return { ok: true };
  }

  @Get('me')
  async getProfile(@Req() req: Request, @Res() res: ExpressResponse) {
    const sessionUser = req.session?.userId;
  
    if (!sessionUser) {
      res.clearCookie('centrifuge', { path: '/' });
      return res.status(401).json({ message: 'unauthorized', status: 401 });
    }
    // Отримуємо актуальні дані з бази
    const user = await this.userService.findById(sessionUser);
    const { password_hash, ...safeUser } = user;
 

    return res.json(safeUser);
  }
}
