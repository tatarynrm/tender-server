// src/libs/common/mail/services/admin-mail.service.ts
import { render } from '@react-email/components';
import { SuccessfulPreRegistrationAccountTemplate } from '../templates/pre-register-success-greeting';
import { Injectable } from '@nestjs/common';
import { MailService } from '../mail.service';
import { SuccessRegisterEmail } from '../templates/admin/auth/SuccessRegisterEmail';

// src/libs/common/mail/services/admin-mail.service.ts

@Injectable()
export class AdminMailService {
  constructor(private readonly mailBase: MailService) {}

  async sendUserCreatedByAdmin(
    email: string,
    data: { name: string; loginUrl: string },
  ) {
    // Передаємо дані прямо в компонент шаблону
    const html = await render(
      SuccessRegisterEmail({
        name: data.name,
        loginUrl: data.loginUrl,
      }),
    );

    return this.mailBase.sendMail(
      email,
      'Ваш аккаунт успішно створено менеджером',
      html,
    );
  }
}
