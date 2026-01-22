import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import {MailerModule} from '@nestjs-modules/mailer'
import {ConfigModule, ConfigService} from '@nestjs/config'
import { getMailerConfig } from 'src/config/mailer.config';
import { AdminMailService } from './services/admin-mail.service';

@Global()
@Module({
imports:[
  MailerModule.forRootAsync({
    imports:[ConfigModule],
    useFactory:getMailerConfig,
    inject:[ConfigService]
  })
],
  providers: [MailService,AdminMailService],
  exports:[MailService,AdminMailService]
})
export class MailModule {}
