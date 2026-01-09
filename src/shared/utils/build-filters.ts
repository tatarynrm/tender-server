export interface FilterItem {
  type: 'query';
  key: string;
  value: string;
}

/**
 * Динамічно будує масив фільтрів з будь-якого об'єкта query.
 * Виключає технічні поля на кшталт 'page', 'limit' тощо.
 */
// export function buildFiltersFromQuery(
//   query: Record<string, any>,
// ): FilterItem[] {
//   const filters: FilterItem[] = [];

//   // Поля, які НЕ потрібно відображати як "бейджи" або фільтри (технічні параметри)
//   const excludedKeys = ['page', 'limit', 'sort'];

//   Object.entries(query).forEach(([key, value]) => {
//     // Пропускаємо порожні значення та технічні ключі
//     if (!value || excludedKeys.includes(key)) return;

//     // Якщо значення - рядок, пробуємо розбити його по комі
//     if (typeof value === 'string') {
//       const values = value
//         .split(',')
//         .map((s) => s.trim())
//         .filter(Boolean);

//       values.forEach((v) => {
//         filters.push({ type: 'query', key, value: v });
//       });
//     } else {
//       // Для чисел або інших типів просто додаємо як є
//       filters.push({ type: 'query', key, value: String(value) });
//     }
//   });

//   return filters;
// }
export function buildFiltersFromQuery(
  query: Record<string, any>,
): FilterItem[] {
  const filters: FilterItem[] = [];

  const excludedKeys = ['page', 'limit', 'sort'];

  Object.entries(query).forEach(([key, value]) => {
    // Пропускаємо порожні значення та технічні ключі
    if (!value || excludedKeys.includes(key)) return;

    // Просто додаємо значення як один рядок, незалежно від того, чи є там коми
    filters.push({ 
      type: 'query', 
      key, 
      value: String(value).trim() 
    });
  });

  return filters;
}