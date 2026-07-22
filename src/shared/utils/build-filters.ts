export interface FilterItem {
  type: 'query' | 'where';
  key?: string;
  value?: string;
  expression?: string;
}
export function buildFiltersFromQuery(
  query: Record<string, any>,
): FilterItem[] {
  const filters: FilterItem[] = [];

  const excludedKeys = ['page', 'limit', 'sort','per_page'];

  Object.entries(query).forEach(([key, value]) => {
    // Пропускаємо порожні занчення чи ключііі
    if (!value || excludedKeys.includes(key)) return;

    if (key === 'international' && String(value).trim() === 'true') {
      filters.push({
        type: 'where',
        expression: `exists (select 1 from tender_route r where r.id_parent = a.id and r.ids_point in ('LOAD_FROM', 'LOAD_TO') and upper(r.ids_country) <> 'UA')`,
      });
    } else if (key === 'regional' && String(value).trim() === 'true') {
      filters.push({
        type: 'where',
        expression: `not exists (select 1 from tender_route r where r.id_parent = a.id and r.ids_point in ('LOAD_FROM', 'LOAD_TO') and upper(r.ids_country) <> 'UA')`,
      });
    } else if (key === 'export' && String(value).trim() === 'true') {
      filters.push({
        type: 'where',
        expression: `exists (select 1 from tender_route r where r.id_parent = a.id and r.ids_point = 'LOAD_FROM' and upper(r.ids_country) = 'UA') and exists (select 1 from tender_route r where r.id_parent = a.id and r.ids_point = 'LOAD_TO' and upper(r.ids_country) <> 'UA')`,
      });
    } else if (key === 'import' && String(value).trim() === 'true') {
      filters.push({
        type: 'where',
        expression: `exists (select 1 from tender_route r where r.id_parent = a.id and r.ids_point = 'LOAD_FROM' and upper(r.ids_country) <> 'UA') and exists (select 1 from tender_route r where r.id_parent = a.id and r.ids_point = 'LOAD_TO' and upper(r.ids_country) = 'UA')`,
      });
    } else if (key === 'transit' && String(value).trim() === 'true') {
      filters.push({
        type: 'where',
        expression: `exists (select 1 from tender_route r where r.id_parent = a.id and r.ids_point = 'LOAD_FROM' and upper(r.ids_country) <> 'UA') and exists (select 1 from tender_route r where r.id_parent = a.id and r.ids_point = 'LOAD_TO' and upper(r.ids_country) <> 'UA')`,
      });
    } else {
      // Просто додаємо значення як один рядок, незалежно від того, чи є там коми
      filters.push({
        type: 'query',
        key,
        value: String(value).trim(),
      });
    }
  });

  return filters;
}
