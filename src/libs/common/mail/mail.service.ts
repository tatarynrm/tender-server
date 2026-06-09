import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { render } from '@react-email/components';
import { ConfirmationTemplate } from './templates/confirmation.template';
import { ResetPasswordTemplate } from './templates/reset-password.template';
import { TwoFactorAuthTemplate } from './templates/two-factor-auth.template';
import { SuccessfulPreRegistrationTemplate } from './templates/pre-register-greeting';
import { SuccessfulPreRegistrationAccountTemplate } from './templates/pre-register-success-greeting';
import { TenderNotificationTemplate } from './templates/tender-notification.template';
import { PasswordChangedTemplate } from './templates/password-changed.template';


@Injectable()
export class MailService {
  public constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}
  public async sendMail(
    email: string,
    subject: string,
    html: string,
    attachments?: any[],
    transporterName?: string,
    from?: string,
  ) {
    return this.mailerService.sendMail({
      to: email,
      subject: subject,
      html,
      attachments,
      transporterName,
      from,
    });
  }
  public async sendConfirmationEmail(email: string, token: string) {
    const domain = this.configService.getOrThrow<string>('APP_CLIENT_URL');
    const from = `"ICT TENDER" <${this.configService.get<string>('ICT_MAIL_PROFILES_LOGIN')}>`;

    const html = await render(ConfirmationTemplate({ domain, token }));
    return this.sendMail(email, 'Підтвердження пошти', html, undefined, 'profiles', from);
  }
  public async sendPasswordResetEmail(email: string, token: string) {
    const domain = this.configService.getOrThrow<string>('APP_CLIENT_URL');
    const from = `"ICT TENDER" <${this.configService.get<string>('ICT_MAIL_PROFILES_LOGIN')}>`;

    const html = await render(ResetPasswordTemplate({ domain, token }));
    return this.sendMail(email, 'Скидання паролю', html, undefined, 'profiles', from);
  }
  public async sendTwoFactorTokenEmail(email: string, token: string) {
    const domain = this.configService.getOrThrow<string>('APP_CLIENT_URL');
    const from = `"ICT TENDER" <${this.configService.get<string>('ICT_MAIL_PROFILES_LOGIN')}>`;
    console.log('Підтвердження');

    const html = await render(TwoFactorAuthTemplate({ token, domain }));
    return this.sendMail(email, 'Підтвердження особистості', html, undefined, 'profiles', from);
  }
  public async sendPreRegisterGreetings(email: string) {
    const domain = this.configService.getOrThrow<string>('APP_CLIENT_URL');
    const from = `"ICT TENDER" <${this.configService.get<string>('ICT_MAIL_PROFILES_LOGIN')}>`;

    console.log('PRE REGISTER EMAIL SEND');

    const html = await render(SuccessfulPreRegistrationTemplate({ domain }));
    return this.sendMail(email, 'Підтвердження особистості', html, undefined, 'profiles', from);
  }
  public async sendPreRegisterSuccessGreeting(
    email: string,
    name?: string,
    showPasswordHint = false,
  ) {
    const domain = this.configService.getOrThrow<string>('APP_CLIENT_URL');
    const from = `"ICT TENDER" <${this.configService.get<string>('ICT_MAIL_PROFILES_LOGIN')}>`;

    console.log('PRE REGISTER SUCCESS EMAIL SEND');

    const html = await render(
      SuccessfulPreRegistrationAccountTemplate({
        name,
        domain,
        showPasswordHint,
      }),
    );
    return this.sendMail(email, 'Ваш аккаунт ICTender активовано!', html, undefined, 'profiles', from);
  }
  // public async sendRegisterFromCompanyEmail(email: string, token: string) {
  //   const domain = this.configService.getOrThrow<string>('APP_CLIENT_URL');

  //   const html = await render(TwoFactorAuthTemplate({ token }));
  //   return this.sendMail(email, 'Підтвердження особистості', html);
  // }

  public async sendTenderNotification(email: string, payload: any) {
    const domain = this.configService.getOrThrow<string>('APP_CLIENT_URL');
    const { type, tenderId, subject, data } = payload;

    const html = await render(
      TenderNotificationTemplate({
        type,
        tenderId,
        domain,
        data,
      }),
    );

    return this.sendMail(
      email,
      subject || `Сповіщення по тендеру №${tenderId}`,
      html,
    );
  }

  public async sendPasswordChangeSuccessEmail(
    email: string,
    userName?: string,
  ) {
    const from = `"ICT TENDER" <${this.configService.get<string>('ICT_MAIL_PROFILES_LOGIN')}>`;
    const html = await render(PasswordChangedTemplate({ userName }));
    return this.sendMail(email, 'Пароль успішно змінено', html, undefined, 'profiles', from);
  }
}
