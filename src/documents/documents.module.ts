import { Module } from '@nestjs/common';
import { UserModule } from 'src/user/user.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [UserModule], // UserService потрібен AuthGuard
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
