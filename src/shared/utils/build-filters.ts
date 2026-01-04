export interface FilterItem {
  type: 'query';
  key: string;
  value: string;
}

export function buildFiltersFromQuery(query: any): FilterItem[] {
  const filters: FilterItem[] = [];
  console.log(query, 'QUERY IN BUILDER');
  // Приклад: для search → city_from
  if (query.city_from) {
    const cities = query.city_from
      .split(',') // розбиваємо по комі
      .map((s: string) => s.trim())
      .filter(Boolean); // видаляємо пусті

    cities.forEach((city: any) => {
      filters.push({ type: 'query', key: 'city_from', value: city });
    });
  }
  if (query.city_to) {
    const cities = query.city_to
      .split(',') // розбиваємо по комі
      .map((s: string) => s.trim())
      .filter(Boolean); // видаляємо пусті

    cities.forEach((city: any) => {
      filters.push({ type: 'query', key: 'city_to', value: city });
    });
  }

  // Можна додати інші ключі
  if (query.country_from) {
    filters.push({
      type: 'query',
      key: 'country_from',
      value: query.country_from,
    });
  }

  if (query.country_to) {
    filters.push({ type: 'query', key: 'country_to', value: query.country_to });
  }

  if (query.trailer) {
    const trailers = query.trailer
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    trailers.forEach((trailer: any) => {
      filters.push({ type: 'query', key: 'trailer', value: trailer });
    });
  }

  return filters;
}
