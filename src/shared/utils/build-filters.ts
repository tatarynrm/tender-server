export interface FilterItem {
  type: 'query';
  key: string;
  value: string;
}
export function buildFiltersFromQuery(
  query: Record<string, any>,
): FilterItem[] {
  const filters: FilterItem[] = [];

  const excludedKeys = ['page', 'limit', 'sort','per_page'];

  Object.entries(query).forEach(([key, value]) => {
    // Пропускаємо порожні занчення чи ключііі
    if (!value || excludedKeys.includes(key)) return;

    // Просто додаємо значення як один рядок, незалежно від того, чи є там коми
    filters.push({
      type: 'query',
      key,
      value: String(value).trim(),
    });
  });

  return filters;
}
