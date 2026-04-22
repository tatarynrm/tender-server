export interface NotificationContent {
  id: number;
  cargo?: string;
  volume?: number;
  weight?: number;
  ids_type?: string;
  time_start?: string;
  time_end?: string;
  date_load?: string;
  date_load2?: string;
  date_unload?: string;
  ids_valut?: string;
  valut_name?: string;
  price_start?: number;
  price_step?: number;
  price_redemption?: number;
  client_name?: string;
  company_name?: string;
  tender_type?: string;
  without_vat?: boolean;
  notes?: string;
  comments?: string;
  managerMessage?: string;
  duration?: number;
  car_count?: number;
  load_from?: any[];
  load_to?: any[];
  trailer?: any[];
  tender_load?: any[];
  tender_route?: any[];
  tender_permission?: any[];
  ref_temperature_from?: number;
  ref_temperature_to?: number;
  best_bid?: number;
  message?: string;
}

export function formatDuration(minutes?: number) {
  if (!minutes) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours} год${mins > 0 ? ` ${mins} хв` : ''}`;
  }
  return `${mins} хв`;
}

export function formatTenderDate(dateStr?: string, dateOnly = false) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    if (dateOnly) return `${day}.${month}.${year}`;
    return `${day}.${month}.${year} об ${hours}:${minutes}`;
  } catch (e) {
    return dateStr;
  }
}

export function getTenderMetadata(content: NotificationContent) {
  const from =
    (content.load_from || [])
      .map((f: any) => `${f.city || '—'} (${f.country || 'UA'})`)
      .join(', ') || 'Не вказано';
  const to =
    (content.load_to || [])
      .map((t: any) => `${t.city || '—'} (${t.country || 'UA'})`)
      .join(', ') || 'Не вказано';

  const routePoints = (content.tender_route || [])
    .sort((a, b) => (a.order_num || 0) - (b.order_num || 0))
    .map((p: any) => {
      let icon = '📍';
      if (p.ids_point === 'BORDER') icon = '🛂';
      if (p.ids_point === 'CUSTOM_UP' || p.ids_point === 'CUSTOM_DOWN')
        icon = '📑';
      return `${icon} ${p.point_name || p.city}: ${p.city}${p.country ? ` (${p.country})` : ''}`;
    })
    .join('\n');

  const trailer =
    (content.trailer || []).map((tr: any) => tr.type).join(', ') || 'Будь-який';
  const loads =
    (content.tender_load || []).map((l: any) => l.load_type_name).join(', ') ||
    'Будь-яка';
  const permissions =
    (content.tender_permission || [])
      .map((p: any) => p.load_type_name)
      .join(', ') || 'Не вказано';

  const vatStatus = content.without_vat ? '🚫 Без ПДВ' : '💰 З ПДВ';

  const tempRegime =
    content.ref_temperature_from !== undefined &&
    content.ref_temperature_from !== null &&
    content.ref_temperature_to !== null
      ? `🌡️ ${content.ref_temperature_from}...${content.ref_temperature_to} °C`
      : null;

  return {
    from,
    to,
    routePoints,
    routeInfo: `${from} ➡️ ${to}`,
    trailer,
    loads,
    permissions,
    vatStatus,
    tempRegime,
    carCount: content.car_count || 1,
    tenderUrl: `https://tender.ict.lviv.ua/dashboard/tender/active`,
  };
}

export function getTelegramMessage(
  content: NotificationContent,
  notifyType: string,
  person: any,
) {
  const { from, to, trailer, carCount, tenderUrl } = getTenderMetadata(content);

  const currency = content.ids_valut === 'EUR' ? 'Є' : content.ids_valut || 'Є';
  const durationStr = formatDuration(content.duration);
  const typeStr = content.tender_type || 'Редукціон';

  const datesPart: string[] = [];
  if (content.date_load)
    datesPart.push(
      `📅 Завантаження: ${formatTenderDate(content.date_load, true)}`,
    );
  if (content.date_load2)
    datesPart.push(
      `📅 Завантаження 2: ${formatTenderDate(content.date_load2, true)}`,
    );
  if (content.date_unload)
    datesPart.push(
      `📅 Вивантаження: ${formatTenderDate(content.date_unload, true)}`,
    );
  const datesStr = datesPart.length > 0 ? datesPart.join('\n') : '';

  let priceInfo = `💰 Тип: ${typeStr}`;
  if (content.price_start && content.price_start > 0) {
    priceInfo += `, старт торгів ${content.price_start}${currency}`;
    if (content.price_step && content.price_step > 0) {
      priceInfo += ` (крок ставки ${content.price_step}${currency})`;
    }
  }
  if (content.price_redemption && content.price_redemption > 0) {
    priceInfo += `\n💰 Викупити рейс: ${content.price_redemption}${currency}!`;
  }

  const timeEndStr = content.time_end
    ? `закінчення - ${formatTenderDate(content.time_end)}`
    : 'безстроковий';

  const details = `
${datesStr}
📦 Вантаж: ${content.cargo || '—'} (${content.weight || 0}т / ${content.volume || 0}м³)
📍 Звідки: ${from}
🏁 Куди: ${to}
🚛 Транспорт: ${trailer} (${carCount} авто)
${priceInfo}
`.trim();

  switch (notifyType) {
    case 'TENDER_PLAN':
      return `
🆕 Тендер заплановано.
Повідомляємо, що ${formatTenderDate(content.time_start)} заплановано проведення тендеру №${content.id}. Тривалість ${durationStr}.
<a href="${tenderUrl}">Переглянути тендер</a>

Деталі тендеру:

${details}`;

    case 'TENDER_ACTUAL':
      return `
🆕 Тендер запущено (${typeStr})
Повідомляємо, що по замовленню №${content.id} - запущено тендер (Тривалість - ${durationStr}, ${timeEndStr})
<a href="${tenderUrl}">Переглянути тендер</a>

Деталі тендеру:

${details}`;

    case 'TENDER_CLOSED':
      return `
🆕 Прийом пропозицій завершено.

Повідомляємо, що прийом пропозицій по тендеру №${content.id} - завершено.
Просимо вас слідкувати за подальшими етапами тендеру у системі або звертати увагу на повідомлення, які надходитимуть на вашу електронну адресу.
<a href="${tenderUrl}">Переглянути тендер</a>

Деталі тендеру:

${details}`;

    case 'TENDER_RESULT':
      const isWinner = person?.is_winner;
      const resultMessage = isWinner
        ? `Після ретельного розгляду всіх пропозицій було прийнято рішення обрати Вас переможцем.`
        : `Після ретельного розгляду всіх пропозицій було прийнято рішення обрати переможцем по лоту іншого учасника.`;

      const bidStatus = isWinner
        ? `💳 Ваша ставка ${person?.bid_price || '—'}${currency} перемогла!`
        : `💳 Ваша ставка ${person?.bid_price || '—'}${currency} не перемогла, краща ставка ${content.best_bid || '—'}${currency}`;

      return `
🆕 Результати тендеру №${content.id} .

${resultMessage}

Деталі тендеру:

${details}

${bidStatus}`;

    case 'TENDER_PROLONGATION':
      return `
🆕 Змінено часові рамки тендеру.
Повідомляємо Вам, що по тендеру №${content.id} нова дата ${timeEndStr}.
<a href="${tenderUrl}">Переглянути тендер</a>

Деталі тендеру:

${details}`;

    case 'TENDER_CHANGED':
      return `
🆕 Повідомляємо Вам, що в тендері №${content.id} відбулися зміни: 
${content.managerMessage || 'Див. деталі в системі'}
<a href="${tenderUrl}">Переглянути тендер</a>

Деталі тендеру:

${details}`;

    case 'TENDER_MESSAGE_ANY':
      return `
🔔 <b>Важливе повідомлення по тендеру №${content.id}</b>

${content.managerMessage || content.message || content.notes || 'Будь ласка, зверніть увагу на нову інформацію від менеджера.'}

<a href="${tenderUrl}">Переглянути тендер</a>

<b>Деталі тендеру:</b>

${details}`;

    default:
      return `📢 <b>Подія по тендеру №${content.id}</b>\nТип: ${notifyType}\n${tenderUrl}`;
  }
}

export function getWebMessage(
  content: NotificationContent,
  notifyType: string,
  person: any,
) {
  const { from, to, trailer, carCount } = getTenderMetadata(content);
  const currency = content.ids_valut === 'EUR' ? 'Є' : content.ids_valut || 'Є';
  const durationStr = formatDuration(content.duration);
  const typeStr = content.tender_type || 'Редукціон';

  const timeStart = content.time_start
    ? formatTenderDate(content.time_start).split(' об ')[1] || '—'
    : '—';
  const timeEnd = content.time_end
    ? `Закінчення ${formatTenderDate(content.time_end).split(' об ')[1] || '—'}`
    : 'Безстроковий';

  const datesPart: string[] = [];
  if (content.date_load)
    datesPart.push(`📅 Зав: ${formatTenderDate(content.date_load, true)}`);
  if (content.date_load2)
    datesPart.push(`📅 Зав 2: ${formatTenderDate(content.date_load2, true)}`);
  if (content.date_unload)
    datesPart.push(`📅 Вив: ${formatTenderDate(content.date_unload, true)}`);
  const datesStr = datesPart.length > 0 ? datesPart.join(', ') : '';

  let priceInfo = `💰 ${typeStr}`;
  if (content.price_start && content.price_start > 0) {
    priceInfo += `, старт ${content.price_start}${currency}`;
    if (content.price_step && content.price_step > 0)
      priceInfo += ` (крок ${content.price_step}${currency})`;
  }

  const buyoutInfo =
    content.price_redemption && content.price_redemption > 0
      ? `\n💰 Викуп: ${content.price_redemption}${currency}!`
      : '';

  const commonInfo = `
${datesStr ? datesStr + '\n' : ''}📦 ${content.cargo || '—'} (${content.weight || 0}т / ${content.volume || 0}м³)
📍 ${from} - ${to} 🚛 ${trailer} (${carCount})
${priceInfo}`.trim();

  switch (notifyType) {
    case 'TENDER_PLAN':
      return `
🆕 Тендер заплановано. №${content.id}, початок ${timeStart}, тривалість ${durationStr}.
${commonInfo}${buyoutInfo}`.trim();

    case 'TENDER_ACTUAL':
      return `
🆕 Тендер запущено. №${content.id}, початок ${timeStart}, тривалість ${durationStr}. ( ${timeEnd} )
${commonInfo}${buyoutInfo}`.trim();

    case 'TENDER_CLOSED':
      return `
🆕 Тендер звершено. №${content.id}. Аналіз.
${commonInfo}
💰 Краща ${content.best_bid || '—'}${currency}${buyoutInfo}`.trim();

    case 'TENDER_RESULT':
      const isWinner = person?.is_winner;
      const winnerStatus = isWinner
        ? `Ви перемогли 💰${person?.bid_price || '—'}${currency}`
        : `Ви не перемогли ${person?.bid_price || '—'}${currency}`;
      return `
🆕 Тендер №${content.id}. ${winnerStatus}
${commonInfo}
💰 Краща ${content.best_bid || '—'}${currency}${buyoutInfo}`.trim();

    case 'TENDER_PROLONGATION':
      return `
🆕 Тендер №${content.id} змінено час. ${timeEnd}
${commonInfo}
💰 Краща ${content.best_bid || '—'}${currency}${buyoutInfo}`.trim();

    case 'TENDER_CHANGED':
      return `
🆕 Тендер №${content.id} 📍 ${from} - ${to} ЗМІНИ!
${content.managerMessage || 'Див. деталі'}`.trim();

    case 'TENDER_MESSAGE_ANY':
      return `
🔔 Повідомлення по тендеру №${content.id}
${content.managerMessage || content.message || content.notes || 'Нова інформація від менеджера'}`.trim();

    default:
      return `📢 Тендер №${content.id}`;
  }
}

export function getEmailData(
  content: NotificationContent,
  notifyType: string,
  person: any,
) {
  const { routeInfo, trailer, loads, tenderUrl } = getTenderMetadata(content);
  const isWinner = person?.is_winner;
  const winnerText = isWinner
    ? 'Після ретельного розгляду всіх пропозицій було прийнято рішення обрати <b>Вас переможцем</b>.'
    : 'Після ретельного розгляду всіх пропозицій було прийнято рішення обрати переможцем по лоту іншого учасника.';

  const combinedDates =
    [
      content.date_load
        ? `Завантаження: ${formatTenderDate(content.date_load, true)}`
        : null,
      content.date_load2
        ? `Завантаження 2: ${formatTenderDate(content.date_load2, true)}`
        : null,
      content.date_unload
        ? `Вивантаження: ${formatTenderDate(content.date_unload, true)}`
        : null,
    ]
      .filter(Boolean)
      .join(', ') || '—';

  return {
    type: notifyType,
    tenderId: content.id,
    data: {
      id: content.id,
      date: combinedDates,
      endDate: content.time_end
        ? formatTenderDate(content.time_end)
        : 'Безстроковий',
      cargo: content.cargo || '—',
      requirements: `${trailer}, ${content.weight || 0}т, ${content.volume || 0}м³, Завантаження: ${loads}`,
      route: routeInfo,
      duration: content.duration ? `${content.duration} хв.` : '—',
      step:
        content.price_step && content.price_step > 0
          ? `${content.price_step} ${content.ids_valut || 'EUR'}`
          : '—',
      buyout:
        content.price_redemption && content.price_redemption > 0 ? 'так' : 'ні',
      message:
        content.managerMessage ||
        content.message ||
        content.notes ||
        content.comments ||
        '—',
      resultText: winnerText,
      tenderType: content.tender_type || 'Редукціон',
      url: tenderUrl,
    },
  };
}
