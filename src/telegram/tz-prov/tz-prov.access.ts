/**
 * Хто може «проводити номери» (вносити тягачі/причепи в транспорт перевізника)
 * через Telegram-бота. Це запис в Oracle (UR_$$PKG.AddAmToTP / AddPrToTP) —
 * тому доступ лише за явним списком Telegram ID, незалежно від ролей на порталі.
 *
 * Порожній список — функція вимкнена для всіх.
 * Свій Telegram ID людина може дізнатися, надіславши боту команду /myid.
 */
export const TZ_PROV_ALLOWED_TELEGRAM_IDS: number[] = [
  282039969, // Татарин Роман (rt@ict.lviv.ua) — адміністратор
  5251288587, // додано на прохання адміністратора; Telegram не прив'язаний до акаунта на порталі
  // 123456789, // Прізвище Ім'я — керівник відділу
];

export function canProvTz(telegramId: number | undefined): boolean {
  return !!telegramId && TZ_PROV_ALLOWED_TELEGRAM_IDS.includes(Number(telegramId));
}
