import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MailService } from 'src/libs/common/mail/mail.service';


@Injectable()
export class TwoFactorAuthService {
  public constructor(

    private readonly mailService: MailService,
  ) {}

  // public async validateTwoFactorToken(email: string, code: string) {
  //   const existingToken = await this.prismaService.token.findFirst({
  //     where: {
  //       email,

  //       type: TokenType.TWO_FACTOR,
  //     },
  //   });

  //   if (!existingToken) {
  //     throw new NotFoundException(
  //       `Токен двухфакторної автентифікації не знайдений. Впевніться що ви запросили токен для даної адреси електронної пошти.`,
  //     );
  //   }
  //   if (existingToken.token !== code) {
  //     throw new BadRequestException(
  //       'Токен не знайдено.Перевірте код та спробуйте знову',
  //     );
  //   }
  //   const isExpired = new Date(existingToken.expiresIn) < new Date();

  //   if (isExpired) {
  //     throw new BadRequestException('Термін дії цього токену вичерпано');
  //   }

  //   await this.prismaService.token.delete({
  //     where: {
  //       id: existingToken.id,
  //       type: TokenType.TWO_FACTOR,
  //     },
  //   });
  //   return true;
  // }
  // public async sendTwoFactorToken(email: string) {
  //   const twoFactorToken = await this.generateTwoFactorToken(email);
  //   await this.mailService.sendTwoFactorTokenEmail(
  //     twoFactorToken.email,
  //     twoFactorToken.token,
  //   );
  //   return true;
  // }
  // private async generateTwoFactorToken(email: string) {
  //   const token = Math.floor(
  //     Math.random() * (100000 - 10000) + 100000,
  //   ).toString();

  //   const expiresIn = new Date(new Date().getTime() + 300000);
  //   const existingToken = await this.prismaService.token.findFirst({
  //     where: {
  //       email,
  //       type: TokenType.TWO_FACTOR,
  //     },
  //   });

  //   if (existingToken) {
  //     await this.prismaService.token.delete({
  //       where: {
  //         id: existingToken.id,
  //         type: TokenType.TWO_FACTOR,
  //       },
  //     });
  //   }

  //   const verificationToken = await this.prismaService.token.create({
  //     data: {
  //       email,
  //       token,
  //       expiresIn,
  //       type: TokenType.TWO_FACTOR,
  //     },
  //   });

  //   return verificationToken;
  // }
}
