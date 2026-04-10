import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios'; // Імпортуємо HttpService з пакету @nestjs/axios
import { catchError, map } from 'rxjs/operators';

@Injectable()
export class NominatimService {
  constructor(private readonly httpService: HttpService) {}

  async search(query: string) {
    try {
      // 1. Формуємо запит до Nominatim
      // const url = `https://nominatim.openstreetmap.org/search?format=json&accept-language=uk&addressdetails=1&limit=5&q=${encodeURIComponent(
      //   query,
      // )}`;

      const url =
        `https://nominatim.openstreetmap.org/search?` +
        `format=json&` +
        `addressdetails=1&` +
        `limit=3&` +
        `accept-language=uk&` +
        `q=${encodeURIComponent(query)}`;
      const searchResults = await this.httpService
        .get(url, {
          headers: {
            'User-Agent': `ICT_Tender_Parser_${Math.random().toString(36).substring(7)}/1.0 (rt@example.com)`,
          },
        })
        .pipe(map((res) => res.data))
        .toPromise();

      if (!searchResults?.length) {
        return [];
      }
      console.log(searchResults, 'SEARCH RESULTS -----------');

      // 2. Форматуємо результат (беремо лише потрібні поля)
      const formatted = searchResults.map((place) => {
        const { address } = place;

        return {
          display_name: place.display_name,
          lat: place.lat,
          lon: place.lon,
          name:
            address.road && address.house_number
              ? `${address.road} ${address.house_number}`
              : address.road ||
                address.city ||
                address.town ||
                address.village ||
                place.display_name,
          address: {
            road: address.road || null,
            house_number: address.house_number || null,
            suburb: address.suburb || null,
            city:
              address.city ||
              address.town ||
              address.village ||
              address.county ||
              null,
            state: address.state || null,
            postcode: address.postcode || null,
            country: address.country || null,
            country_code: address.country_code || null,
          },
        };
      });

      return formatted;
    } catch (error) {
      console.error('Nominatim API Error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch data from Nominatim API: ${error.message}`);
    }
  }
}
