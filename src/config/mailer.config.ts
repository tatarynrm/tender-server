import { MailerOptions } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

export const getMailerConfig = async (
  configService: ConfigService,
): Promise<MailerOptions> =>
(
      {
    transport: {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.MAIL_LOGIN,
        pass: process.env.MAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false,
      },
      defaults: {
        from: `"NORIS_DEVELOPER TEAM" ${configService.getOrThrow<string>('MAIL_LOGIN')}`,
      },
    },
  }
)
  // ({
  //   transport: {
  //     // service: "smtp",
  //     host: 'mail.ict.lviv.ua',
  //     port: 465,
  //     secure: true,
  //     auth: {
  //       user: 'ict-info-logistics@ict.lviv.ua',
  //       pass: 'Tfc34#sR51',
  //     },
  //   },
  // });
// export const getMailerConfig = async (
//   configService: ConfigService,
// ): Promise<MailerOptions> => ({
//   transport: {
//     host: process.env.ICT_MAIL_HOST!,
//     port: process.env.ICT_MAIL_PORT!,
//     secure: true, // STARTTLS
//     auth: {
//       user: process.env.ICT_MAIL_LOGIN!,
//       pass: process.env.ICT_MAIL_PASSWORD!,
//     },
//     tls: {
//       rejectUnauthorized: false,
//     },
//     // defaults: {
//     //   // from: `"NORIS_DEVELOPER TEAM" ${configService.getOrThrow<string>('ICT_MAIL_LOGIN')}`,
//     //   from: `tender@ict.lviv.ua`,
//     // },
//   },
// });
