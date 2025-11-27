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
        `limit=5&` +
        `accept-language=uk&` + // повертає назви українською
        `featuretype=city&` + // тільки міста
        `dedupe=1&` + // уникнути дублікатів
        `q=${encodeURIComponent(query)}`;
      const searchResults = await this.httpService
        .get(url)
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
      throw new Error('Failed to fetch data from Nominatim API');
    }
  }
}
