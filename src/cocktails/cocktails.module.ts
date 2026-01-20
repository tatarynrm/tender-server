import { Module } from '@nestjs/common';
import { CocktailsService } from './cocktails.service';
import { CocktailsController } from './cocktails.controller';
import { DatabaseModule } from 'src/database/database.module';
import { UserService } from 'src/user/user.service';
import { MulterModule } from '@nestjs/platform-express';
import { MulterConfigService } from 'src/config/multer.config.service';

@Module({
  imports: [
    DatabaseModule,
    MulterModule.registerAsync({
      useClass: MulterConfigService,
    }),
  ],
  controllers: [CocktailsController],
  providers: [CocktailsService, UserService],
})
export class CocktailsModule {}
