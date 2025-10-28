import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios'; // Імпортуємо HttpModule для роботи з HttpService
import { NominatimService } from './nominatim.service';
import { NominatimController } from './nominatim.controller';

@Module({
  imports: [HttpModule],  // Імпортуємо HttpModule
  providers: [NominatimService], // Реєструємо сервіс
  exports: [NominatimService],   // Експортуємо, щоб його можна було використовувати в інших модулях
  controllers:[NominatimController]
})
export class NominatimModule {}
