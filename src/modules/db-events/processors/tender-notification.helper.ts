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
  const days = Math.floor(minutes / (60 * 24));
  const remainingMins = minutes % (60 * 24);
  const hours = Math.floor(remainingMins / 60);
  const mins = remainingMins % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} дн`);
  if (hours > 0) parts.push(`${hours} год`);
  if (mins > 0) parts.push(`${mins} хв`);

  return parts.length > 0 ? parts.join(' ') : '—';
}

export function formatTenderDate(
  dateStr?: string,
  forceDateOnly = false,
  hideZeroTime = false,
) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    // Створюємо форматер для київського часу
    const formatter = new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const getPart = (type: string) =>
      parts.find((p) => p.type === type)?.value || '00';

    const day = getPart('day');
    const month = getPart('month');
    const year = getPart('year');
    const hours = getPart('hour');
    const minutes = getPart('minute');

    if (forceDateOnly) return `${day}.${month}.${year}`;
    if (hideZeroTime && hours === '00' && minutes === '00')
      return `${day}.${month}.${year}`;

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
    tenderUrl: `${process.env.APP_CLIENT_URL || 'https://tender.ict.lviv.ua'}/dashboard/tender/${content.id}`,
  };
}

export function getTelegramMessage(
  content: NotificationContent,
  notifyType: string,
  person: any,
) {
  const { from, to, trailer, carCount, tenderUrl } = getTenderMetadata(content);
  console.log(content, 'CONTENT');

  const currency = content.ids_valut === 'EUR' ? 'Є' : content.ids_valut || 'Є';

  const startMs = content.time_start
    ? new Date(content.time_start).getTime()
    : 0;
  const endMs = content.time_end ? new Date(content.time_end).getTime() : 0;

  let durationStr = formatDuration(content.duration);
  if (startMs && !endMs) {
    durationStr = 'Безстроковий';
  } else if (startMs && endMs) {
    const diffMins = Math.max(0, Math.floor((endMs - startMs) / 60000));
    durationStr = formatDuration(diffMins);
  }

  const typeStr = content.tender_type || 'Редукціон';

  const datesPart: string[] = [];
  if (content.date_load && !content.date_load2) {
    datesPart.push(
      `📅 Завантаження: ${formatTenderDate(content.date_load, false, true)}`,
    );
  } else if (content.date_load && content.date_load2) {
    datesPart.push(
      `📅 Завантаження: ${formatTenderDate(content.date_load, false, true)} — ${formatTenderDate(content.date_load2, false, true)}`,
    );
  }
  if (content.date_unload) {
    datesPart.push(
      `📅 Вивантаження: ${formatTenderDate(content.date_unload, false, true)}`,
    );
  }
  const datesStr = datesPart.length > 0 ? datesPart.join('\n') : '';

  let priceInfo = `💰 Тип: ${typeStr}`;
  if (content.price_start && content.price_start > 0) {
    priceInfo += `, старт торгів ${content.price_start} ${currency}`;
    if (content.price_step && content.price_step > 0) {
      priceInfo += ` (крок ставки ${content.price_step} ${currency})`;
    }
  }
  if (content.price_redemption && content.price_redemption > 0) {
    priceInfo += `\n💰 Викупити рейс: ${content.price_redemption} ${currency}!`;
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
Повідомляємо, що ${formatTenderDate(content.time_start)} заплановано проведення тендеру <a href="${tenderUrl}">№${content.id}</a>. Тривалість ${durationStr}.

Деталі тендеру:

${details}`;

    case 'TENDER_ACTUAL':
      return `
🆕 Тендер запущено (${typeStr})
Повідомляємо, що по замовленню <a href="${tenderUrl}">№${content.id}</a> - запущено тендер (Тривалість - ${durationStr}, ${timeEndStr})

Деталі тендеру:

${details}`;

    case 'TENDER_CLOSED':
      return `
🆕 Прийом пропозицій завершено.

Повідомляємо, що прийом пропозицій по тендеру <a href="${tenderUrl}">№${content.id}</a> - завершено.
Просимо вас слідкувати за подальшими етапами тендеру у системі або звертати увагу на повідомлення, які надходитимуть на вашу електронну адресу.

Деталі тендеру:

${details}`;

    case 'TENDER_RESULT':
      const isWinner = (content?.car_count ?? 0) > 0;
      const resultMessage = isWinner
        ? `Після ретельного розгляду всіх пропозицій було прийнято рішення обрати Вас переможцем.`
        : `Після ретельного розгляду всіх пропозицій було прийнято рішення обрати переможцем по лоту іншого учасника.`;

      const bidStatus = isWinner
        ? `💳 Ваша ставка  перемогла! К-сть авто ${content?.car_count || '—'}`
        : `💳 Ваша ставка - не перемогла!`;

      return `
🆕 Результати тендеру <a href="${tenderUrl}">№${content.id}</a> .

${resultMessage}

Деталі тендеру:

${details}

${bidStatus}`;

    case 'TENDER_PROLONGATION':
      return `
🆕 Змінено часові рамки тендеру.
Повідомляємо Вам, що по тендеру <a href="${tenderUrl}">№${content.id}</a> нова дата ${timeEndStr}.

Деталі тендеру:

${details}`;

    case 'TENDER_CHANGED':
      return `
🆕 Повідомляємо Вам, що в тендері <a href="${tenderUrl}">№${content.id}</a> відбулися зміни: 
${content.managerMessage || 'Див. деталі в системі'}

Деталі тендеру:

${details}`;

    case 'TENDER_MESSAGE_ANY':
      return `
🔔 <b>Важливе повідомлення по тендеру <a href="${tenderUrl}">№${content.id}</a></b>

${content.managerMessage || content.message || content.notes || 'Будь ласка, зверніть увагу на нову інформацію від менеджера.'}

<b>Деталі тендеру:</b>

${details}`;

    default:
      return `📢 <b>Подія по тендеру <a href="${tenderUrl}">№${content.id}</a></b>\nТип: ${notifyType}`;
  }
}

export function getWebMessage(
  content: NotificationContent,
  notifyType: string,
  person: any,
) {
  const { from, to, trailer, carCount } = getTenderMetadata(content);
  const currency = content.ids_valut === 'EUR' ? 'Є' : content.ids_valut || 'Є';

  const startMs = content.time_start
    ? new Date(content.time_start).getTime()
    : 0;
  const endMs = content.time_end ? new Date(content.time_end).getTime() : 0;

  let durationStr = formatDuration(content.duration);
  if (startMs && !endMs) {
    durationStr = 'Безстроковий';
  } else if (startMs && endMs) {
    const diffMins = Math.max(0, Math.floor((endMs - startMs) / 60000));
    durationStr = formatDuration(diffMins);
  }

  const typeStr = content.tender_type || 'Редукціон';

  const timeStart = content.time_start
    ? formatTenderDate(content.time_start).split(' об ')[1] || '—'
    : '—';
  const timeEnd = content.time_end
    ? `Закінчення ${formatTenderDate(content.time_end).split(' об ')[1] || '—'}`
    : 'Безстроковий';

  const datesPart: string[] = [];
  if (content.date_load && !content.date_load2) {
    datesPart.push(
      `📅 Зав: ${formatTenderDate(content.date_load, false, true)}`,
    );
  } else if (content.date_load && content.date_load2) {
    datesPart.push(
      `📅 Зав: ${formatTenderDate(content.date_load, false, true)} — ${formatTenderDate(content.date_load2, false, true)}`,
    );
  }
  if (content.date_unload) {
    datesPart.push(
      `📅 Вив: ${formatTenderDate(content.date_unload, false, true)}`,
    );
  }
  const datesStr = datesPart.length > 0 ? datesPart.join(', ') : '';

  let priceInfo = `💰 ${typeStr}`;
  if (content.price_start && content.price_start > 0) {
    priceInfo += `, старт ${content.price_start} ${currency}`;
    if (content.price_step && content.price_step > 0)
      priceInfo += ` (крок ${content.price_step} ${currency})`;
  }

  const buyoutInfo =
    content.price_redemption && content.price_redemption > 0
      ? `\n💰 Викуп: ${content.price_redemption} ${currency}!`
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
💰 Краща ${content.best_bid || '—'} ${currency}${buyoutInfo}`.trim();

    case 'TENDER_RESULT':
      const isWinner = (content?.car_count ?? 0) > 0;
      const winnerStatus = isWinner
        ? `Ви перемогли 💰${person?.bid_price || '—'} ${currency}`
        : `Ви не перемогли ${person?.bid_price || '—'} ${currency}`;
      return `
🆕 Тендер №${content.id}. ${winnerStatus}
${commonInfo}
💰 Краща ${content.best_bid || '—'} ${currency}${buyoutInfo}`.trim();

    case 'TENDER_PROLONGATION':
      return `
🆕 Тендер №${content.id} змінено час. ${timeEnd}
${commonInfo}
💰 Краща ${content.best_bid || '—'} ${currency}${buyoutInfo}`.trim();

    case 'TENDER_CHANGED':
      return `
🆕 Тендер №${content.id} 📍 ${from} - ${to} ЗМІНИ!
${content.managerMessage || 'Див. деталі'}`.trim();

    case 'TENDER_MESSAGE_ANY':
      return `
🔔 Повідомлення по тендеру №${content.id}
${content.managerMessage || content.message || content.notes || 'Нова інформація від менеджера'}
`.trim();

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
  const isWinner = (content?.car_count ?? 0) > 0;
  const winnerText = isWinner
    ? 'Після ретельного розгляду всіх пропозицій було прийнято рішення обрати <b>Вас переможцем</b>.'
    : 'Після ретельного розгляду всіх пропозицій було прийнято рішення обрати переможцем по лоту іншого учасника.';

  const startMs = content.time_start
    ? new Date(content.time_start).getTime()
    : 0;
  const endMs = content.time_end ? new Date(content.time_end).getTime() : 0;

  let durationStr = formatDuration(content.duration);
  if (startMs && !endMs) {
    durationStr = 'Безстроковий';
  } else if (startMs && endMs) {
    const diffMins = Math.max(0, Math.floor((endMs - startMs) / 60000));
    durationStr = formatDuration(diffMins);
  }

  const combinedDates =
    [
      content.date_load && !content.date_load2
        ? `Завантаження: ${formatTenderDate(content.date_load, false, true)}`
        : content.date_load && content.date_load2
          ? `Завантаження: ${formatTenderDate(content.date_load, false, true)} — ${formatTenderDate(content.date_load2, false, true)}`
          : null,
      content.date_unload
        ? `Вивантаження: ${formatTenderDate(content.date_unload, false, true)}`
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
      duration: durationStr,
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
