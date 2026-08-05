import { SchemaCatalog } from './schema.types';

/**
 * Опорний каталог таблиць Postgres — шар СЕНСУ, а не список доступу.
 *
 * Доступ модель отримує від живої інтроспекції: SchemaCatalogService читає всі
 * таблиці схеми `public` (крім DENIED_TABLE_PATTERNS нижче) разом із колонками,
 * коментарями й зовнішніми ключами, і саме з цього будується whitelist
 * SqlGuardService. Тобто нова таблиця в базі стає видимою моделі без правки коду.
 *
 * Тут лишається те, чого в метаданих БД немає: призначення таблиці своїми
 * словами, значення статусів, готові JOIN-и, правила рахунку й приклади
 * «питання → SQL». Ці таблиці йдуть у промпті першими — вони найуживаніші.
 * Колонки нижче — резерв на випадок, коли база недоступна на старті.
 *
 * Oracle у каталозі свідомо відсутній — для помічника він вимкнений.
 */
export const POSTGRES_CATALOG: SchemaCatalog = {
  dialect: 'postgres',

  tables: [
    {
      name: 'company',
      description: 'Компанії-контрагенти: клієнти, перевізники, експедиції.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'company_name', type: 'varchar', description: 'Коротка назва' },
        { name: 'company_name_full', type: 'varchar', description: 'Повна назва' },
        { name: 'edrpou', type: 'varchar', description: 'ЄДРПОУ' },
        { name: 'ids_country', type: 'varchar', description: 'Країна' },
        { name: 'address', type: 'varchar', description: 'Адреса' },
        { name: 'is_carrier', type: 'boolean', description: 'Це перевізник' },
        { name: 'is_client', type: 'boolean', description: 'Це клієнт' },
        { name: 'is_expedition', type: 'boolean', description: 'Це експедиція' },
        { name: 'is_blocked', type: 'boolean', description: 'Заблокована' },
        { name: 'black_list', type: 'boolean', description: 'У чорному списку' },
        { name: 'ids_carrier_rating', type: 'varchar', description: 'Рейтинг перевізника' },
        { name: 'created_at', type: 'timestamptz' },
      ],
      hints: [
        'Назву компанії шукати через ILIKE \'%фрагмент%\' — користувач рідко пише її повністю.',
      ],
    },
    {
      name: 'person',
      description: 'Фізичні особи: працівники ICT і контактні особи контрагентів.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'surname', type: 'varchar', description: 'Прізвище' },
        { name: 'name', type: 'varchar', description: 'Ім’я' },
        { name: 'last_name', type: 'varchar', description: 'По батькові' },
        { name: 'email', type: 'varchar' },
        { name: 'position', type: 'varchar', description: 'Посада' },
        { name: 'id_company', type: 'bigint', description: 'Компанія' },
        { name: 'date_employment', type: 'date', description: 'Дата прийому' },
        { name: 'date_release', type: 'date', description: 'Дата звільнення' },
      ],
      hints: [
        'Повне ім’я збирати як surname || \' \' || name.',
        'Працівник вважається чинним, якщо date_release IS NULL.',
      ],
    },
    {
      name: 'person_role',
      description: 'Ролі працівника в системі.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'id_person', type: 'bigint' },
        { name: 'is_admin', type: 'boolean' },
        { name: 'is_ict', type: 'boolean', description: 'Працівник ICT' },
        { name: 'is_manager', type: 'boolean' },
        { name: 'is_head_department', type: 'boolean', description: 'Начальник відділу' },
      ],
    },
    {
      name: 'person_phone',
      description: 'Телефони працівників і контактних осіб.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'id_person', type: 'bigint' },
        { name: 'phone', type: 'varchar' },
        { name: 'is_telegram', type: 'boolean' },
        { name: 'is_viber', type: 'boolean' },
        { name: 'is_whatsapp', type: 'boolean' },
      ],
    },
    {
      name: 'person_telegram',
      description: 'Прив’язані Telegram-акаунти працівників.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'id_person', type: 'bigint' },
        { name: 'telegram_id', type: 'bigint' },
        { name: 'username', type: 'varchar' },
        { name: 'first_name', type: 'varchar' },
      ],
    },
    {
      name: 'department',
      description: 'Відділи компанії.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'department_name', type: 'varchar', description: 'Назва відділу українською' },
        { name: 'id_company', type: 'bigint' },
        { name: 'root_company', type: 'bigint', description: 'Ознака головного відділу' },
      ],
      hints: [
        'Головні відділи мають root_company IS NULL; решта — іменні підрозділи, у звіти їх не беруть.',
        'Назви відділів українські, шукати через ILIKE (\'міжнарод\' → «Відділ міжнародних перевезень»).',
      ],
    },
    {
      name: 'person_department',
      description: 'Зв’язок працівник ↔ відділ.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'id_person', type: 'bigint' },
        { name: 'id_department', type: 'bigint' },
      ],
    },
    {
      name: 'vehicle',
      description: 'Транспорт перевізників: тягачі й причепи.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'carnum', type: 'varchar', description: 'Державний номер' },
        { name: 'id_company', type: 'bigint', description: 'Компанія-власник' },
        { name: 'ids_vehicle_type', type: 'varchar' },
        { name: 'ids_trailer_type', type: 'varchar', description: 'Тип причепа' },
        { name: 'main', type: 'boolean', description: 'true — з мотором, false — причіп' },
        { name: 'vin', type: 'varchar' },
        { name: 'year_release', type: 'integer' },
        { name: 'euro', type: 'integer', description: 'Євро-клас' },
      ],
    },
    {
      name: 'tender',
      description: 'Тендери на перевезення, які публікують менеджери ICT.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'cargo', type: 'varchar', description: 'Вантаж' },
        { name: 'id_author', type: 'bigint', description: 'Автор — менеджер ICT' },
        { name: 'id_owner_company', type: 'bigint', description: 'Власник тендера' },
        { name: 'price_start', type: 'numeric', description: 'Стартова ціна' },
        { name: 'price_step', type: 'numeric', description: 'Крок ставки' },
        { name: 'price_redemption', type: 'numeric', description: 'Ціна викупу' },
        { name: 'price_client', type: 'numeric', description: 'Ціна клієнта' },
        { name: 'ids_valut', type: 'varchar', description: 'Валюта' },
        { name: 'weight', type: 'numeric', description: 'Маса вантажу' },
        { name: 'volume', type: 'numeric', description: 'Об’єм вантажу' },
        { name: 'car_count', type: 'integer', description: 'Потрібно авто' },
        { name: 'date_load', type: 'timestamptz', description: 'Дата завантаження' },
        { name: 'date_unload', type: 'timestamptz', description: 'Дата розвантаження' },
        { name: 'time_start', type: 'timestamptz', description: 'Старт торгів' },
        { name: 'time_end', type: 'timestamptz', description: 'Кінець торгів' },
        { name: 'created_at', type: 'timestamptz', description: 'Коли створено' },
      ],
      hints: [
        'Період «коли опублікували тендер» — це created_at.',
        'Ціна клієнта (price_client) — внутрішня, у відповідях перевізникам її не наводити.',
      ],
    },
    {
      name: 'tender_lst',
      description: 'Позиції тендера: маршрут, країни, статус, кількість авто.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'id_tender', type: 'bigint' },
        { name: 'city_from', type: 'varchar', description: 'Звідки' },
        { name: 'city_to', type: 'varchar', description: 'Куди' },
        { name: 'ids_country_from', type: 'varchar' },
        { name: 'ids_country_to', type: 'varchar' },
        { name: 'ids_status', type: 'varchar', description: 'Статус тендера' },
        { name: 'ids_transit_type', type: 'varchar', description: 'Експорт/імпорт/регіон/транзит' },
        { name: 'car_count_all', type: 'integer', description: 'Всього авто' },
        { name: 'car_count_actual', type: 'integer', description: 'Актуально' },
        { name: 'car_count_closed', type: 'integer', description: 'Закрито' },
        { name: 'car_count_canceled', type: 'integer', description: 'Не закрито' },
      ],
      hints: [
        'ids_status приймає значення DRAFT, ANALYZE, ACTIVE, CLOSED, ARCHIVE.',
        '«Активні» = ACTIVE, «закриті/проведені» = CLOSED, чернетки = DRAFT.',
      ],
    },
    {
      name: 'tender_rate',
      description: 'Ставки перевізників у тендерах.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'id_tender', type: 'bigint' },
        { name: 'id_company', type: 'bigint', description: 'Компанія-перевізник' },
        { name: 'id_author', type: 'bigint', description: 'Хто подав ставку' },
        { name: 'price_proposed', type: 'numeric', description: 'Запропонована ціна' },
        { name: 'car_count', type: 'integer', description: 'Скільки авто запропоновано' },
        { name: 'time_add', type: 'timestamptz', description: 'Коли подано ставку' },
      ],
      hints: [
        'Період «коли перевізники ставили ставки» — це time_add.',
        'Найкраща ставка — мінімальна price_proposed по тендеру.',
      ],
    },
    {
      name: 'tender_winner',
      description: 'Переможці тендерів.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'id_tender', type: 'bigint' },
        { name: 'id_company', type: 'bigint' },
        { name: 'id_person', type: 'bigint' },
        { name: 'id_tender_rate', type: 'bigint', description: 'Ставка, яка виграла' },
        { name: 'car_count', type: 'integer' },
      ],
    },
    {
      name: 'crm_load',
      description: 'Заявки клієнтів (CRM): вантаж, фрахт, дати.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'id_client', type: 'bigint', description: 'Замовник' },
        { name: 'id_author', type: 'bigint' },
        { name: 'price', type: 'numeric', description: 'Фрахт' },
        { name: 'ids_valut', type: 'varchar', description: 'Валюта' },
        { name: 'date_load', type: 'date', description: 'Дата завантаження' },
        { name: 'date_unload', type: 'date', description: 'Дата розвантаження' },
        { name: 'load_info', type: 'text', description: 'Інформація про вантаж' },
        { name: 'is_collective', type: 'boolean', description: 'Збірний вантаж' },
        { name: 'created_at', type: 'timestamptz' },
      ],
      hints: [
        'Колонку private_info (приватні нотатки ICT) у вибірку не включати.',
      ],
    },
    {
      name: 'files',
      description: 'Завантажені файли й скани, прив’язані до сутностей системи.',
      columns: [
        { name: 'id', type: 'bigint' },
        { name: 'display_name', type: 'varchar', description: 'Назва' },
        { name: 'extension', type: 'varchar' },
        { name: 'file_size', type: 'bigint', description: 'Розмір у байтах' },
        { name: 'tblref', type: 'varchar', description: 'Сутність: company, tender, crm_load…' },
        { name: 'id_tblref', type: 'bigint', description: 'ID запису цієї сутності' },
        { name: 'id_company', type: 'bigint' },
        { name: 'created_at', type: 'timestamptz' },
      ],
      hints: ['Колонки url і key — службові посилання на сховище, у вибірку не включати.'],
    },
  ],

  joins: [
    'tender + маршрут і статус: FROM tender t JOIN tender_lst tl ON tl.id_tender = t.id',
    'tender + ставки: LEFT JOIN tender_rate r ON r.id_tender = t.id',
    'ставка + перевізник: JOIN company c ON c.id = r.id_company',
    'tender + переможець: LEFT JOIN tender_winner w ON w.id_tender = t.id',
    'відділ автора тендера: JOIN person p ON p.id = t.id_author JOIN person_department pd ON pd.id_person = p.id JOIN department d ON d.id = pd.id_department',
    'працівник + компанія: JOIN company c ON c.id = person.id_company',
    'працівник + ролі: JOIN person_role pr ON pr.id_person = person.id',
    'заявка CRM + замовник: JOIN company c ON c.id = crm_load.id_client',
    'авто + власник: JOIN company c ON c.id = vehicle.id_company',
  ],

  rules: [
    'Відділ тендера = відділ його автора (tender.id_author), окремої колонки відділу в тендері немає.',
    'У звітах по відділах брати лише головні відділи: department.root_company IS NULL.',
    'Часові фільтри: tender.created_at — публікація тендера, tender_rate.time_add — подання ставки, crm_load.date_load — завантаження вантажу.',
    'Грошові підсумки округляти: ROUND(SUM(...)::numeric, 2).',
    'Текстовий пошук — лише ILIKE \'%фрагмент%\', ніколи не порівнювати рядки через =.',
    'Кількість — COUNT(DISTINCT ...), коли в запиті є JOIN зі ставками (інакше рядки дублюються).',
    'Дані про паролі, сесії та логіни недоступні — таблиці usr не існує для тебе.',
  ],

  examples: [
    {
      question: 'Скільки тендерів створено минулого місяця по відділах?',
      sql:
        "SELECT d.department_name, COUNT(DISTINCT t.id) AS tenderiv " +
        "FROM tender t JOIN person p ON p.id = t.id_author " +
        "JOIN person_department pd ON pd.id_person = p.id " +
        "JOIN department d ON d.id = pd.id_department " +
        "WHERE d.root_company IS NULL AND t.created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month') " +
        "AND t.created_at < date_trunc('month', CURRENT_DATE) " +
        "GROUP BY d.department_name ORDER BY tenderiv DESC LIMIT 100",
    },
    {
      question: 'Які активні тендери зараз і скільки по них ставок?',
      sql:
        "SELECT t.id, t.cargo, tl.city_from, tl.city_to, t.price_start, COUNT(r.id) AS stavok " +
        "FROM tender t JOIN tender_lst tl ON tl.id_tender = t.id " +
        "LEFT JOIN tender_rate r ON r.id_tender = t.id " +
        "WHERE tl.ids_status = 'ACTIVE' " +
        "GROUP BY t.id, t.cargo, tl.city_from, tl.city_to, t.price_start " +
        "ORDER BY t.created_at DESC LIMIT 100",
    },
    {
      question: 'Топ перевізників за кількістю ставок за останні 30 днів',
      sql:
        "SELECT c.company_name, COUNT(r.id) AS stavok, ROUND(AVG(r.price_proposed)::numeric, 2) AS serednia " +
        "FROM tender_rate r JOIN company c ON c.id = r.id_company " +
        "WHERE r.time_add >= CURRENT_DATE - INTERVAL '30 days' " +
        "GROUP BY c.company_name ORDER BY stavok DESC LIMIT 50",
    },
    {
      question: 'Заявки клієнта «Агро» на завантаження цього місяця',
      sql:
        "SELECT l.id, c.company_name, l.price, l.date_load, l.date_unload, l.load_info " +
        "FROM crm_load l JOIN company c ON c.id = l.id_client " +
        "WHERE c.company_name ILIKE '%Агро%' AND l.date_load >= date_trunc('month', CURRENT_DATE) " +
        "ORDER BY l.date_load DESC LIMIT 100",
    },
  ],
};

/**
 * Колонки, які не показуємо моделі, навіть якщо вони є в базі:
 * технічні поля міграції та унікальності лише засмічують контекст,
 * а приватні нотатки ICT і посилання на сховище моделі не потрібні.
 */
export const HIDDEN_COLUMN_PATTERNS: RegExp[] = [
  /^migrate_/i,
  /_uk$/i,
  /^devid$/i,
  /^private_info$/i,
  /^(url|key)$/i,
  /^gps_(lat|lon)$/i,
  // Персональні дані й секрети: у прикладних питаннях вони не потрібні,
  // а в промпті лише спокушають модель їх вибрати
  /password/i,
  /^ipn$/i,
  /token/i,
];

/**
 * Таблиці, які інтроспекція НЕ бере в каталог, хоч вони й існують у `public`.
 *
 * Відколи модель бачить усю схему, це єдиний фільтр між нею і службовими
 * даними: логіни, сесії, черги сповіщень і технічні таблиці міграцій.
 * Те саме продубльовано в SqlGuardService.ALWAYS_DENIED — навмисно, щоб
 * помилка в одному місці не відкривала доступ.
 */
export const DENIED_TABLE_PATTERNS: RegExp[] = [
  /^usr$/i,
  /^users?$/i,
  // Заявки на реєстрацію: там password_hash і персональні дані ще не наших користувачів
  /^usr_pre_register$/i,
  /^session/i,
  /^pg_/i,
  /^sql_/i,
  /_migrations?$/i,
  /^migrations?$/i,
  /^typeorm_/i,
  /^knex_/i,
  /^_prisma_/i,
  /password/i,
  /^token/i,
  /_token$/i,
];
