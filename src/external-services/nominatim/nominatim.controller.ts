import { Controller, Get, Post, Query } from '@nestjs/common';
import { NominatimService } from './nominatim.service'; // Імпортуємо сервіс

@Controller('nominatim')
export class NominatimController {
  constructor(private readonly nominatimService: NominatimService) {}

  // Маршрут для пошуку
  @Get('search') // Це повинно бути /nominatim/search
  async search(@Query('q') query: string) {
    console.log(query, 'QUERY');

    if (!query) {
      throw new Error('Query parameter "q" is required'); // Перевірка на наявність параметра
    }

    try {
      const result = await this.nominatimService.search(query);
      console.log(result, 'RESULT');
      return result; // Повертаємо результат пошуку
    } catch (error) {
      throw new Error('Failed to fetch search results');
    }
  }
  @Post() // Це повинно бути /nominatim/search
  async nom() {
    return {
      message: 'ok',
    };
  }
}
