import { Markup } from 'telegraf';

/**
 * Рівень доступу користувача бота.
 *
 * Чотири рівні (кожен наступний включає попередній):
 *  - registered            — звичайний користувач (перевізник);
 *  - isIct                 — менеджер ІСТ (person_role.is_ict);
 *  - isIctAdmin            — адміністратор ІСТ (is_ict + is_admin);
 *  - isSuperAdmin          — головний адмін із TELEGRAM_ADMIN_ID (системні дії).
 */
export interface TelegramAccess {
  registered: boolean;
  isIct: boolean;
  isIctAdmin: boolean;
  isSuperAdmin: boolean;
  /** Telegram ID є в tz-prov.access.ts — може проводити номери авто/причепів */
  canProvTz?: boolean;
  personId?: number;
  companyId?: number;
  fullName?: string;
  /** Рядок із getProfileByTelegramId — потрібен для «Мій профіль». */
  profile?: any;
}

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const KYIV_DATE: Intl.DateTimeFormatOptions = {
  timeZone: 'Europe/Kyiv',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
};

export function fmtDate(d: any): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('uk-UA', KYIV_DATE);
  } catch {
    return String(d);
  }
}

/** Головне меню — набір кнопок залежить від рівня доступу. */
export function buildMainMenu(access: TelegramAccess, portalUrl: string) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];

  if (access.isIct) {
    rows.push([
      Markup.button.callback('📈 Зведення', 'ict_summary'),
      Markup.button.callback('📋 Активні тендери', 'active_tenders'),
    ]);
  } else {
    rows.push([Markup.button.callback('📢 Активні тендери', 'active_tenders')]);
    rows.push([
      Markup.button.callback('💰 Мої ставки', 'my_rates'),
      Markup.button.callback('🏆 Перемоги', 'my_wins'),
    ]);
  }

  if (access.canProvTz) {
    rows.push([Markup.button.callback('🚛 Провести номери авто / причепів', 'tzp:start')]);
  }

  rows.push([Markup.button.callback('👤 Мій профіль', 'my_profile')]);

  if (access.isIctAdmin) {
    rows.push([Markup.button.callback('📊 Звіти по тендерах (ШІ)', 'enter_reports')]);
    rows.push([Markup.button.callback('👥 Статистика бота', 'get_stats')]);
  }

  if (access.isSuperAdmin) {
    rows.push([Markup.button.callback('🧠 ШІ-База', 'enter_ai')]);
    rows.push([
      Markup.button.callback('📬 Непрочитані листи', 'check_unread_mail'),
      Markup.button.callback('🚀 Деплой', 'run_deploy'),
    ]);
    rows.push([Markup.button.callback('👔 Ролі ICT', 'manage_ict_roles')]);
  }

  rows.push([
    Markup.button.url(
      '🌐 Відкрити портал',
      access.isIct ? `${portalUrl}/log` : `${portalUrl}/dashboard`,
    ) as any,
  ]);
  rows.push([Markup.button.callback('ℹ️ Про бота', 'bot_info')]);

  return Markup.inlineKeyboard(rows);
}

export const BACK_TO_MENU_KEYBOARD = Markup.inlineKeyboard([
  [Markup.button.callback('⬅️ Меню', 'main_menu')],
]);

export function formatProfile(access: TelegramAccess): string {
  const p = access.profile || {};
  const roles: string[] = [];
  if (p.is_admin) roles.push('Адміністратор');
  if (p.is_ict) roles.push('Менеджер ІСТ');
  if (!roles.length) roles.push('Перевізник');

  const lines = ['👤 <b>Мій профіль</b>', ''];
  lines.push(`ПІБ: <b>${esc(access.fullName || '—')}</b>`);
  if (p.position) lines.push(`Посада: ${esc(p.position)}`);
  if (p.email) lines.push(`Email: ${esc(p.email)}`);
  if (p.company_name) {
    lines.push(
      `🏢 Компанія: <b>${esc(p.company_name)}</b>` +
        (p.edrpou ? ` (ЄДРПОУ ${esc(p.edrpou)})` : ''),
    );
  }
  lines.push('');
  lines.push(`Роль: ${roles.join(', ')}`);
  lines.push(`Статус: ${p.is_blocked ? '🚫 заблокований' : '✅ активний'}`);
  if (p.username) lines.push(`Telegram: @${esc(p.username)}`);
  return lines.join('\n');
}

/** Детальний список активних напрямків — для менеджерів ІСТ. */
export function formatActiveTendersList(rows: any[]): string {
  if (!rows.length) return '📋 Активних тендерів зараз немає.';

  const lines = [`📋 <b>Активні тендери</b> (${rows.length} найближчих до завершення):`, ''];
  for (const r of rows) {
    const route =
      `${esc(r.city_from || '—')} (${esc(r.ids_country_from || '?')})` +
      ` → ${esc(r.city_to || '—')} (${esc(r.ids_country_to || '?')})`;
    const price = r.request_price
      ? 'запит ціни'
      : `${r.price_start ?? '—'} ${esc(r.ids_valut || '')}`;
    lines.push(`• <b>#${r.id}</b> ${route}`);
    lines.push(
      `   📦 ${esc(r.cargo || 'вантаж не вказано')} · 💵 ${price}` +
        ` · 🚛 ${r.car_count ?? '—'} авто · ⏳ до ${fmtDate(r.time_end)}`,
    );
  }
  return lines.join('\n');
}

/**
 * Для перевізників деталі тендерів не показуємо: видимість тендера залежить від
 * рейтингу та типу учасників і рахується процедурами БД. Бот дає лише кількість
 * і веде на портал, де доступ перевіряється як слід.
 */
export function formatActiveTendersTeaser(count: number): string {
  if (!count) {
    return '📢 Зараз активних тендерів немає.\n\nЩойно з’явиться новий — вам прийде сповіщення.';
  }
  return (
    `📢 Зараз на платформі <b>${count}</b> активних тендерних напрямків.\n\n` +
    'Переглянути деталі та подати ставку можна на порталі 👇'
  );
}

export function formatCompanyRates(rows: any[]): string {
  if (!rows.length) {
    return '💰 Ваша компанія ще не подавала ставок у тендерах.\n\nАктивні тендери — в меню або на порталі.';
  }

  const lines = [`💰 <b>Останні ставки вашої компанії</b>:`, ''];
  for (const r of rows) {
    const route = `${esc(r.city_from || '—')} → ${esc(r.city_to || '—')}`;
    const win = r.is_winner ? ' 🏆' : '';
    lines.push(
      `• <b>#${r.tender_id}</b> ${route} — ${r.price_proposed} ${esc(r.ids_valut || '')},` +
        ` ${r.car_count ?? 1} авто, ${fmtDate(r.time_add)}${win}`,
    );
  }
  lines.push('', '🏆 — ставка перемогла в тендері');
  return lines.join('\n');
}

export function formatCompanyWins(rows: any[]): string {
  if (!rows.length) {
    return '🏆 Виграних тендерів поки немає.\n\nПодавайте ставки в активних тендерах — і перемоги з’являться тут.';
  }

  const lines = [`🏆 <b>Виграні тендери вашої компанії</b>:`, ''];
  for (const r of rows) {
    const route = `${esc(r.city_from || '—')} → ${esc(r.city_to || '—')}`;
    const price = r.price_proposed
      ? `${r.price_proposed} ${esc(r.ids_valut || '')}`
      : '—';
    lines.push(
      `• <b>#${r.tender_id}</b> ${route} — ${price}, ${r.car_count ?? 1} авто` +
        (r.time_add ? `, ставка від ${fmtDate(r.time_add)}` : ''),
    );
  }
  return lines.join('\n');
}

export function formatIctSummary(s: any): string {
  return [
    '📈 <b>Зведення по тендерах</b>',
    '',
    `🟢 Активні напрямки: <b>${s.active_lines}</b>`,
    `🟡 На аналізі: <b>${s.analyze_lines}</b>`,
    '',
    '<b>За 24 години:</b>',
    `• нових тендерів: ${s.tenders_24h}`,
    `• ставок перевізників: ${s.rates_24h}`,
    '',
    '<b>За 7 днів:</b>',
    `• нових тендерів: ${s.tenders_7d}`,
    `• ставок перевізників: ${s.rates_7d}`,
  ].join('\n');
}

/**
 * Керування ролями працівників ICT — доступне лише головному адміну
 * (TELEGRAM_ADMIN_ID). Показує/змінює is_admin та is_manager виключно тим,
 * у кого person_role.is_ict = true; is_ict тут не чіпаємо.
 */
export interface IctRoleUser {
  person_id: number;
  name?: string;
  surname?: string;
  last_name?: string;
  is_admin: boolean;
  is_manager: boolean;
  is_ict: boolean;
}

function ictRoleUserFullName(u: IctRoleUser): string {
  return [u.surname, u.name, u.last_name].filter(Boolean).join(' ') || `#${u.person_id}`;
}

function ictRoleUserBadge(u: IctRoleUser): string {
  return u.is_admin ? '👑' : u.is_manager ? '🧑‍💼' : '👤';
}

export function formatIctRolesList(users: IctRoleUser[]): string {
  if (!users.length) {
    return '👔 <b>Ролі ICT</b>\n\nПрацівників ICT не знайдено.';
  }
  return `👔 <b>Ролі ICT</b> (${users.length})\n\nОберіть користувача, щоб видати чи змінити роль:`;
}

export function buildIctRolesListMenu(users: IctRoleUser[]) {
  const rows = users.map((u) => [
    Markup.button.callback(
      `${ictRoleUserBadge(u)} ${esc(ictRoleUserFullName(u))}`,
      `ict_role_user_${u.person_id}`,
    ),
  ]);
  rows.push([Markup.button.callback('⬅️ Меню', 'main_menu')]);
  return Markup.inlineKeyboard(rows);
}

export function formatIctRoleUser(u: IctRoleUser): string {
  return [
    `👔 <b>${esc(ictRoleUserFullName(u))}</b>`,
    '',
    `Адміністратор: ${u.is_admin ? '✅ так' : '⬜️ ні'}`,
    `Менеджер: ${u.is_manager ? '✅ так' : '⬜️ ні'}`,
    '',
    'Натисніть роль, щоб видати або зняти її.',
  ].join('\n');
}

export function buildIctRoleUserMenu(u: IctRoleUser) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        `${u.is_admin ? '✅' : '⬜️'} Адміністратор`,
        `ict_role_toggle_admin_${u.person_id}`,
      ),
    ],
    [
      Markup.button.callback(
        `${u.is_manager ? '✅' : '⬜️'} Менеджер`,
        `ict_role_toggle_manager_${u.person_id}`,
      ),
    ],
    [Markup.button.callback('⬅️ До списку', 'manage_ict_roles')],
  ]);
}
