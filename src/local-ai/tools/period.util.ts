/**
 * Розбір періодів, якими оперує модель.
 *
 * Модель повертає або ключове слово ("last_month"), або явні дати.
 * Обидва варіанти зводяться тут до пари ISO-дат, щоб SQL завжди отримував
 * параметри, а не текст від LLM.
 */

export type PeriodKeyword =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'this_year';

export interface ResolvedPeriod {
  /** Початок періоду, YYYY-MM-DD (включно). */
  from: string;
  /** Кінець періоду, YYYY-MM-DD (включно). */
  to: string;
  /** Людська назва — щоб модель могла повторити її у відповіді. */
  label: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

const toIso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Перетворює period/dateFrom/dateTo з аргументів tool на конкретний діапазон.
 * Явні дати мають пріоритет над ключовим словом.
 */
export function resolvePeriod(args: {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
}): ResolvedPeriod {
  const isDate = (v?: string): v is string =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  if (isDate(args.dateFrom) || isDate(args.dateTo)) {
    const from = isDate(args.dateFrom) ? args.dateFrom : args.dateTo!;
    const to = isDate(args.dateTo) ? args.dateTo : args.dateFrom!;
    return { from, to, label: from === to ? from : `${from} — ${to}` };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (args.period as PeriodKeyword) {
    case 'yesterday': {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 1);
      return { from: toIso(d), to: toIso(d), label: 'вчора' };
    }
    case 'last_7_days': {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 6);
      return { from: toIso(d), to: toIso(startOfToday), label: 'останні 7 днів' };
    }
    case 'last_30_days': {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - 29);
      return { from: toIso(d), to: toIso(startOfToday), label: 'останні 30 днів' };
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toIso(first), to: toIso(startOfToday), label: 'поточний місяць' };
    }
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toIso(first), to: toIso(last), label: 'минулий місяць' };
    }
    case 'this_year': {
      const first = new Date(now.getFullYear(), 0, 1);
      return { from: toIso(first), to: toIso(startOfToday), label: 'поточний рік' };
    }
    case 'today':
    default:
      return {
        from: toIso(startOfToday),
        to: toIso(startOfToday),
        label: 'сьогодні',
      };
  }
}

/** Значення, які приймає поле `period` — для JSON-схем tools. */
export const PERIOD_ENUM: PeriodKeyword[] = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_month',
  'last_month',
  'this_year',
];
