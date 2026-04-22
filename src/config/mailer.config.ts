import { MailerOptions } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

export const getMailerConfig = async (
  configService: ConfigService,
): Promise<MailerOptions> => ({
  transport: {
    host: configService.get<string>('ICT_MAIL_HOST'),
    port: Number(configService.get<number>('ICT_MAIL_PORT')),
    secure: true, 
    auth: {
      user: configService.get<string>('ICT_MAIL_LOGIN'),
      pass: configService.get<string>('ICT_MAIL_PASSWORD'),
    },
    tls: {
      rejectUnauthorized: false,
    },
  },
  defaults: {
    from: `"ICT TENDER" <${configService.get<string>('ICT_MAIL_LOGIN')}>`,
  },
});
