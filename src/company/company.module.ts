import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { UserModule } from 'src/user/user.module';
import { AuthGuard } from 'src/auth/guards/auth.guard';

@Module({
  imports: [UserModule], // тільки модулі
  controllers: [CompanyController],
  providers: [CompanyService, AuthGuard], // сервіси і guard-и
  exports: [CompanyService], // якщо інші модулі будуть його використовувати
})
export class CompanyModule {}
