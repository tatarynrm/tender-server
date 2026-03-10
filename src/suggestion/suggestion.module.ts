import { Module } from '@nestjs/common';
import { SuggestionService } from './suggestion.service';
import { SuggestionController } from './suggestion.controller';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [UserModule],
  controllers: [SuggestionController],
  providers: [SuggestionService, AuthGuard],
})
export class SuggestionModule { }
