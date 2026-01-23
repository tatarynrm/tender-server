import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisClientType } from 'redis';
import { DatabaseService } from 'src/database/database.service';
import { MailService } from 'src/libs/common/mail/mail.service';
import { AdminMailService } from 'src/libs/common/mail/services/admin-mail.service';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';

@Injectable()
export class AdminUserService {
  public constructor(
    private readonly configSerivce: ConfigService,
    private readonly dbservice: DatabaseService,
    private readonly adminMailService: AdminMailService, // Використовуємо новий сервіс
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) {}

  public async createUser(dto: AdminCreateUserDto) {
    console.log(dto, 'DTO');

    const result = await this.dbservice.callProcedure(
      'usr_register_ict',
      dto,
      {},
    );

    // Підготовка даних для листа
    const emailData = {
      name: dto.name || 'Користувач',

      loginUrl: this.configSerivce.getOrThrow<string>('APP_CLIENT_URL'),
    };

    // Відправка
    await this.adminMailService.sendUserCreatedByAdmin(dto.email, emailData);

    return result;
  }
}
