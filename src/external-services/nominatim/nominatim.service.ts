import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';  // Імпортуємо HttpService з пакету @nestjs/axios
import { catchError, map } from 'rxjs/operators';

@Injectable()
export class NominatimService {
  constructor(private readonly httpService: HttpService) {}

  // Функція для пошуку по API
//   async search(query: string) {
//     console.log(query,'QUERY');
    
//     try {
//       // Формуємо запит до Nominatim API
//       const url = `https://nominatim.openstreetmap.org/details?osmtype=R&osmid=72380&format=json&q=${encodeURIComponent(query)}`;
      
//       // Використовуємо HttpService для отримання відповіді
//       const response = await this.httpService
//         .get(url)
//         .pipe(
//           map((response) => response.data), // Отримуємо дані
//           catchError((error) => {
//             throw new Error('Error fetching data from Nominatim API');
//           }),
//         )
//         .toPromise(); // Перетворюємо в promise, щоб отримати результат

//       return response; // Повертаємо результат запиту
//     } catch (error) {
//       throw new Error('Failed to fetch data from Nominatim API');
//     }
//   }
// async search(query: string) {
//   try {
//     // 1. Пошук основного об’єкта
//     const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
//     const searchResults = await this.httpService
//       .get(url)
//       .pipe(map((res) => res.data))
//       .toPromise();

//     if (!searchResults?.length) {
//       return [];
//     }

//     // 2. Для кожного результату робимо запит деталей (опціонально, або лише для першого)
//     const detailedResults = await Promise.all(
//       searchResults.map(async (place) => {
//         const osmTypeLetter =
//           place.osm_type === 'relation'
//             ? 'R'
//             : place.osm_type === 'way'
//             ? 'W'
//             : 'N';

//         const detailsUrl = `https://nominatim.openstreetmap.org/details?osmtype=${osmTypeLetter}&osmid=${place.osm_id}&format=json`;

//         try {
//           const details = await this.httpService
//             .get(detailsUrl)
//             .pipe(map((res) => res.data))
//             .toPromise();

//           return { ...place, details };
//         } catch {
//           return place; // Якщо details не вдалось отримати — повертаємо базовий об’єкт
//         }
//       }),
//     );

//     return detailedResults;
//   } catch (error) {
//     throw new Error('Failed to fetch data from Nominatim API');
//   }
// }
async search(query: string) {
  try {
    // 1. Формуємо запит до Nominatim
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(
      query,
    )}`;

    const searchResults = await this.httpService
      .get(url)
      .pipe(map((res) => res.data))
      .toPromise();

    if (!searchResults?.length) {
      return [];
    }

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
