# LocalAiModule — локальний AI-помічник

Корпоративний помічник на **локальній LLM через LM Studio**. Дані компанії не залишають локальну мережу: жодного звернення до хмарних API тут немає.

Модуль **не замінює і не чіпає** наявний `src/ai/` (хмарний Gemini для Telegram-бота й пошти) — це окремий, незалежний контур.

## Що вміє зараз

Чат із моделлю, який відповідає на питання по даних компанії. **Єдине джерело — Postgres**; Oracle вимкнено (`LOCAL_AI_ORACLE_ENABLED`, дефолт `false`).

| Функція (tool) | Джерело | Доступ |
|---|---|---|
<!-- | `getOrders` | Postgres `crm_load` | усі |
| `generateReport` | Postgres `tender*` | ICT / admin |
| `searchDocuments` | Postgres `files` | усі | -->
| `runSqlQuery` | Postgres, **SQL пише модель** | ICT / admin |

| `getTripsReport` `getTruckLocation` `getDriverStatus` `getClientDebt` | Oracle `ZAY` / `AVRMONCLIENT` | **вимкнені** |
Можеш аналізувати таблиці та робити будь які select окрім видалення чи заміни інформації!
Oracle-tools не реєструються взагалі, поки джерело вимкнене: показувати моделі функцію, яка гарантовано впаде, гірше за її відсутність. Так само зникає тип звіту `profit` у `generateReport`.

## Як це працює

```
React (/log/ai)
   ↓ POST /local-ai/chat  (кука centrifuge)
LocalAiService
   ├─ 1. роутер:      модель обирає tool + аргументи (JSON-схема)
   ├─ 2. ToolRegistry: перевірка існування tool і прав користувача
   │      ├─ фіксовані tools → SELECT із коду, значення біндами
   │      └─ runSqlQuery → SqlGeneratorService (модель пише SELECT за каталогом схеми)
   │           └─ SqlGuardService  → лише SELECT, whitelist таблиць, LIMIT
   │                └─ ReadOnlyQueryService → READ ONLY-транзакція + statement_timeout
   │                     └─ Postgres
   └─ 3. форматування: модель переказує отримані рядки українською
```

## Генерація SQL моделлю (`runSqlQuery`)

Для типових питань лишаються фіксовані tools — вони швидші й передбачувані. `runSqlQuery` покриває все інше: нестандартні зрізи, яких заздалегідь не передбачили.

Модель отримує каталог таблиць і повертає JSON `{sql, explanation}`. Якщо запит не пройшов валідатор або впав у БД, помилка йде назад у модель і вона робить **одну** спробу виправлення (`MAX_ATTEMPTS = 2`). Згенерований SQL повертається на фронт у `meta.generatedSql` — користувач має бачити, звідки взялися цифри.

Доступ — лише ICT та адміністратори: довільна вибірка по всій схемі показала б перевізнику ставки конкурентів, чого фіксовані tools не дозволяють.

### Заборонено все, крім SELECT

`SqlGuardService` — головний рубіж, і він же покритий тестами (`sql-guard.service.spec.ts`, 20 кейсів):

| Правило | Що відхиляється |
|---|---|
| лише `SELECT` | `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`, `COMMIT`, `CALL`… |
| одна інструкція | `SELECT 1; DROP TABLE …` |
| без коментарів | `--`, `/* */` — класичний спосіб сховати хвіст запиту |
| без блокувань | `FOR UPDATE`, `FOR SHARE` |
| whitelist таблиць | усе, чого немає в каталозі схеми |
| чорний список | `usr`, `session`, `information_schema`, `pg_catalog`, будь-що з префіксом `pg_` |
| приватні колонки | `private_info`, `password_hash` — навіть у дозволених таблицях |
| побічні ефекти | `set_config`, `nextval`, `dblink`, `lo_import`… |
| ліміт рядків | `LIMIT` дописується або зрізається до `LOCAL_AI_MAX_ROWS` |

`set_config` у списку не випадково: `SELECT set_config('statement_timeout','0',false)` формально не пише даних, проходить READ ONLY-транзакцію, переживає `ROLLBACK` і лишається на зʼєднанні, яке повертається в **спільний** `PG_POOL`.

Далі — READ ONLY-транзакція зі `statement_timeout`: СУБД сама відхиляє запис. Кожен запит — і виконаний, і відхилений — потрапляє в лог.

## Каталог схеми — звідки модель знає про таблиці

`src/local-ai/schema/`:

- [postgres.catalog.ts](schema/postgres.catalog.ts) — **список дозволених таблиць** із описом призначення, значеннями статусів, готовими JOIN-ами, правилами предметної області і прикладами «питання → SQL». Додати таблицю сюди = видати моделі доступ до неї, бо whitelist валідатора будується саме звідси.
- [schema-catalog.service.ts](schema/schema-catalog.service.ts) — на старті перечитує `information_schema` і підтягує фактичні колонки, типи й `COMMENT ON COLUMN` (у нашій базі коментарі українські, тож описи колонок беруться з БД безкоштовно). Жива база має пріоритет над файлом; якщо БД недоступна — працює статичний каталог.

Технічні колонки (`migrate_*`, `*_uk`, `url`, `key`, `private_info`) у промпт не потрапляють — див. `HIDDEN_COLUMN_PATTERNS`.

Каталог у поточному стані видно через `GET /local-ai/schema`; після зміни структури таблиць — `POST /local-ai/schema/refresh` без перезапуску бекенда.

### Чому JSON-схема, а не native tool calling

Завантажена `qwen/qwen2.5-vl-7b` параметр `tools` мовчки ігнорує — повертає порожній `tool_calls`. Тому маршрутизація йде через `response_format: json_schema`, що працює на будь-якій моделі. `LmStudioClient.supportsNativeTools()` показує, чи підтримує поточна модель нативний протокол (у вашому LM Studio його має лише `google/gemma-4-e4b`).

### Рубежі захисту SQL

1. **SqlGuardService** — правила з таблиці вище (лише `SELECT`, whitelist, ліміт).
2. **READ ONLY-транзакція** зі `statement_timeout` — СУБД сама відхиляє запис.

Третій рубіж із ТЗ — окремий користувач БД `postgres_ai_reader` з правом лише `SELECT` — **поки не заведений**: `ReadOnlyQueryService` бере той самий `PG_POOL`, що й решта застосунку. Коли такий користувач зʼявиться, під нього потрібен окремий пул, а не зміна цього коду.

Кожен запит — і виконаний, і відхилений — потрапляє в лог (`SQL [dialect] source=... tables=[...]`).

## Змінні оточення

Усі мають робочі дефолти — модуль піднімається без правок `.env`.

| Змінна | Дефолт | Призначення |
|---|---|---|
| `LM_STUDIO_URL` | `http://localhost:1234` | адреса локального сервера |
| `LM_STUDIO_MODEL` | `qwen/qwen2.5-vl-7b` | ідентифікатор моделі |
| `LM_STUDIO_TIMEOUT_MS` | `120000` | таймаут запиту до моделі |
| `LOCAL_AI_SQL_TIMEOUT_MS` | `15000` | `statement_timeout` для SQL |
| `LOCAL_AI_MAX_ROWS` | `200` | стеля рядків на запит |
| `LOCAL_AI_ORACLE_ENABLED` | `false` | Oracle як джерело даних; `true` повертає рейси, авто, водіїв, борги і звіт `profit` |
| `LOCAL_AI_HISTORY_TTL_SECONDS` | `2592000` (30 днів) | TTL історії в Redis |
| `LOCAL_AI_HISTORY_MAX_MESSAGES` | `200` | скільки повідомлень тримати в сесії |
| `LOCAL_AI_MAX_SESSIONS` | `10` | скільки розмов тримати на користувача |
| `LOCAL_AI_ALLOWED_EMAILS` | `rt@ict.lviv.ua` | кому відкритий помічник; кілька пошт — через кому |

Заміна моделі — це зміна `LM_STUDIO_MODEL`; заміна раннера (Ollama, vLLM) — правка одного `LmStudioClient`.

## Хто має доступ

Модуль у дослідній експлуатації, тому доступ **поіменний**, а не за роллю: локальна модель займає GPU машини, пише SQL сама і бачить усю схему тендерної платформи.

`LOCAL_AI_ALLOWED_EMAILS` (дефолт `rt@ict.lviv.ua`, кілька пошт — через кому) перевіряє [LocalAiAccessGuard](guards/local-ai-access.guard.ts). Він висить на **всьому контролері** через декоратор `@LocalAiAccess()` — так новий ендпоінт не може випадково лишитися відкритим. Гард fail-closed: немає користувача в запиті — 403.

Декоратор навмисно збирає `UseGuards(AuthGuard, LocalAiAccessGuard)` одним масивом: гард читає `request.user`, який кладе AuthGuard, а при двох окремих декораторах порядок залежав би від того, як їх переставлять у файлі.

На фронті пункт меню й сторінка `/log/ai` сховані тим самим списком у [client-ai/src/shared/constants/local-ai.ts](../../../client-ai/src/shared/constants/local-ai.ts) — це лише UI-гейт, справжня перевірка тут. Списки треба тримати однаковими.

## Ендпоінти

Усі під `@LocalAiAccess()` — кука `centrifuge` плюс перевірка пошти.

```
GET    /local-ai/health                  стан моделі, функції, стан каталогу схеми
GET    /local-ai/schema                  таблиці й колонки, які бачить модель
POST   /local-ai/schema/refresh          перечитати схему з БД
GET    /local-ai/sessions                список розмов
POST   /local-ai/sessions                нова розмова
GET    /local-ai/sessions/:id/messages   історія
PATCH  /local-ai/sessions/:id            перейменувати
DELETE /local-ai/sessions/:id            видалити одну розмову
DELETE /local-ai/sessions                видалити всі розмови користувача
POST   /local-ai/chat                    { text, sessionId? }
```

## Історія чату

Живе в **Redis** (`ai:sessions:*`, `ai:session:*`, `ai:messages:*`) з TTL, бо схему Postgres у цьому проєкті ми не змінюємо.

Доступ іде через інтерфейс `ChatHistoryStore`. Коли зʼявляться процедури `ai_session_*`, достатньо додати другу реалізацію і підмінити клас у `local-ai.module.ts` — `LocalAiService` не змінюється.

### Скільки це важить у памʼяті

Разом із відповіддю зберігається до 50 рядків таблиці даних, тому одна розмова — це десятки кілобайт у Redis, який тримає все в RAM. Звідси три обмеження:

- **`LOCAL_AI_MAX_SESSIONS` (10)** — стеля розмов на користувача. Найстаріші за `updatedAt` видаляються повністю, разом із повідомленнями (`trimOldSessions`); зачистка йде і при створенні сесії, і при кожному читанні списку, щоб історія, накопичена до появи ліміту, теж прибралася.
- **`LOCAL_AI_HISTORY_MAX_MESSAGES` (200)** — хвіст повідомлень усередині розмови (`LTRIM`).
- **`DELETE /local-ai/sessions`** — ручне очищення всієї історії з UI.

Сесія створюється **лише разом із першим повідомленням**: кнопка «Нова розмова» на фронті просто чистить екран. Інакше кожен її клік займав би слот у ліміті й витісняв найстарішу справжню переписку порожньою.

Стеля віддається на фронт у `GET /local-ai/health` (`limits.maxSessions`) — щоб число «10» не дублювалося константою в React.

Якщо `POST /local-ai/chat` отримав `sessionId` неіснуючої розмови (її витіснив ліміт або зʼїв TTL), діалог не обривається — сервер заводить нову сесію і ставить у відповіді `sessionReplaced: true`, а фронт показує про це тост. Мовчазна підміна виглядала б як безслідне зникнення листування.

## Запуск

```powershell
# 1. LM Studio: запустити локальний сервер і завантажити модель
#    Developer → Start Server (порт 1234)

# 2. Інфраструктура
cd server-ai; docker compose up -d db redis

# 3. Бекенд і фронт
cd server-ai; npm run start:dev
cd client-ai; npm run start:dev
```

Сторінка — `/log/ai` (простір менеджерів ICT).

Перевірити модель без фронта:

```powershell
curl http://localhost:1234/v1/models
```

## Чого ще немає

Реалізовано ядро з ТЗ. Поза цією ітерацією лишилися:

- завантаження й розбір документів (PDF / DOCX / XLSX / зображення) — на бекенді вже є `pdf-parse`, `xlsx`, `exceljs`, `sharp`; бракує `mammoth` для DOCX, а `qwen2.5-vl` вміє читати зображення напряму;
- голос: Whisper (STT) і Piper (TTS) — на машині розробки немає ні `ffmpeg`, ні Python, тож потрібне окреме встановлення;
- експорт звітів в Excel / PDF — генератори вже є у `src/telegram/report-file.service.ts`, їх можна перевикористати;
- MCP-сервери;
- ролі `ACCOUNTANT` / `DISPATCHER` — у системі зараз лише `is_admin` / `is_ict` / `is_manager`, нові ролі потребують змін у БД, які веде окремий розробник.
