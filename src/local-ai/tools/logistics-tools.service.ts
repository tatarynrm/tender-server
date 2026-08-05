import { Injectable, Logger } from '@nestjs/common';
import { ReadOnlyQueryService } from '../sql/read-only-query.service';
import { PERIOD_ENUM, resolvePeriod } from './period.util';
import { AiTool, ToolContext, ToolResult } from './tool.types';

/**
 * Логістичні tools — фіксовані параметризовані SELECT-и.
 *
 * Тут модель керує лише значеннями біндів, а не текстом запиту: для типових
 * питань це швидше й передбачуваніше за генерацію SQL. Для нестандартних зрізів
 * є окремий tool `runSqlQuery`, де модель пише запит сама.
 *
 * Джерела даних:
 *   Postgres — тендерна платформа, заявки CRM, файли (єдине активне джерело);
 *   Oracle (ICTDAT) — рейси, фінанси, контракти. ВИМКНЕНО: tools нижче
 *   реєструються лише при LOCAL_AI_ORACLE_ENABLED=true.
 */
@Injectable()
export class LogisticsToolsService {
  private readonly logger = new Logger(LogisticsToolsService.name);

  constructor(private readonly readOnly: ReadOnlyQueryService) {}

  /** Усі tools модуля — реєстр збирає їх звідси. */
  public getTools(): AiTool[] {
    const tools: AiTool[] = [
      this.getOrders(),
      this.generateReport(),
      this.searchDocuments(),
    ];

    if (!this.readOnly.isOracleEnabled()) {
      // Показувати моделі tool, який гарантовано впаде на рівні ReadOnlyQueryService,
      // гірше за його відсутність: вона обиратиме його й отримуватиме відмову
      this.logger.log(
        'Oracle вимкнено — tools по рейсах, авто, водіях і боргах не реєструються',
      );
      return tools;
    }

    return [
      ...tools,
      this.getTripsReport(),
      this.getTruckLocation(),
      this.getDriverStatus(),
      this.getClientDebt(),
    ];
  }

  // ─────────────────────────────────────────────────────────────
  // Рейси
  // ─────────────────────────────────────────────────────────────

  private getTripsReport(): AiTool {
    return {
      name: 'getTripsReport',
      description:
        'Звіт по рейсах (заявках на перевезення) з Oracle за період: номер, дата, вантаж, маршрут, дати завантаження й розвантаження, авто, водій. ' +
        'Якщо delayedOnly=true — лише рейси, у яких планова дата розвантаження вже минула. ' +
        'Використовуй для питань про рейси, перевезення, затримки, маршрути.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: PERIOD_ENUM,
            description: 'Період за датою завантаження',
          },
          dateFrom: { type: 'string', description: 'Дата від, YYYY-MM-DD' },
          dateTo: { type: 'string', description: 'Дата до, YYYY-MM-DD' },
          delayedOnly: {
            type: 'boolean',
            description: 'Лише затримані рейси (дата розвантаження в минулому)',
          },
        },
        required: ['period'],
      },
      execute: async (args, ctx): Promise<ToolResult> => {
        const period = resolvePeriod(args);
        const delayedOnly = args.delayedOnly === true;

        const sql =
          `SELECT z.KOD, z.NUMDOC, z.DATDOC, z.VANTAZH, z.MARSH, z.PUNKTZ, z.PUNKTR, ` +
          `z.DATZAV, z.DATROZV, z.AM, z.PR, z.VOD1, z.VOD1TEL, z.VANTTON, f.NFIRMA AS PEREVIZNYK ` +
          `FROM ZAY z LEFT JOIN PEREV p ON z.KOD_PER = p.KOD LEFT JOIN FIRMA f ON p.KOD_FIRMA = f.KOD ` +
          `WHERE z.DATZAV >= TO_DATE(:date_from, 'YYYY-MM-DD') ` +
          `AND z.DATZAV < TO_DATE(:date_to, 'YYYY-MM-DD') + 1 ` +
          (delayedOnly ? `AND z.DATROZV < TRUNC(SYSDATE) ` : '') +
          `ORDER BY z.DATZAV DESC`;

        const result = await this.readOnly.run(sql, 'oracle', {
          userId: ctx.user?.id,
          source: 'getTripsReport',
        }, { date_from: period.from, date_to: period.to });

        return {
          summary: delayedOnly
            ? `Затриманих рейсів за ${period.label}: ${result.rowCount}`
            : `Рейсів за ${period.label}: ${result.rowCount}`,
          rows: result.rows,
          rowCount: result.rowCount,
          truncated: result.truncated,
          meta: { period: period.label, delayedOnly, source: 'Oracle ZAY' },
        };
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Заявки клієнтів (CRM)
  // ─────────────────────────────────────────────────────────────

  private getOrders(): AiTool {
    return {
      name: 'getOrders',
      description:
        'Заявки клієнтів із CRM тендерної платформи (Postgres): клієнт, ціна, дати завантаження й розвантаження, опис вантажу. ' +
        'Використовуй для питань про заявки, замовлення клієнтів, бронювання вантажів.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: PERIOD_ENUM,
            description: 'Період за датою завантаження',
          },
          dateFrom: { type: 'string', description: 'Дата від, YYYY-MM-DD' },
          dateTo: { type: 'string', description: 'Дата до, YYYY-MM-DD' },
          clientName: {
            type: 'string',
            description: 'Частина назви компанії-клієнта для пошуку',
          },
        },
        required: ['period'],
      },
      execute: async (args, ctx): Promise<ToolResult> => {
        const period = resolvePeriod(args);
        const clientName =
          typeof args.clientName === 'string' && args.clientName.trim()
            ? `%${args.clientName.trim()}%`
            : null;

        const sql =
          `SELECT l.id, c.company_name AS client, l.price, l.date_load, l.date_unload, l.load_info ` +
          `FROM crm_load l LEFT JOIN company c ON l.id_client = c.id ` +
          `WHERE l.date_load >= $1::date AND l.date_load <= $2::date ` +
          `AND ($3::text IS NULL OR c.company_name ILIKE $3) ` +
          `ORDER BY l.date_load DESC`;

        const result = await this.readOnly.run(sql, 'postgres', {
          userId: ctx.user?.id,
          source: 'getOrders',
        }, [period.from, period.to, clientName]);

        return {
          summary: `Заявок за ${period.label}: ${result.rowCount}${clientName ? ` (клієнт містить «${args.clientName}»)` : ''}`,
          rows: result.rows,
          rowCount: result.rowCount,
          truncated: result.truncated,
          meta: { period: period.label, source: 'Postgres crm_load' },
        };
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Авто і водії
  // ─────────────────────────────────────────────────────────────

  private getTruckLocation(): AiTool {
    return {
      name: 'getTruckLocation',
      description:
        'Останній відомий рейс автомобіля за номером: маршрут, пункт завантаження й розвантаження, дати, водій, перевізник. ' +
        'УВАГА: GPS-трекінгу в системі немає, тому це остання відома заявка по цьому авто, а не поточні координати. ' +
        'Використовуй для питань «де авто», «що з машиною», «останній рейс авто».',
      parameters: {
        type: 'object',
        properties: {
          plate: {
            type: 'string',
            description: 'Державний номер авто або його частина',
          },
        },
        required: ['plate'],
      },
      execute: async (args, ctx): Promise<ToolResult> => {
        const plate = String(args.plate ?? '').trim().toUpperCase();
        if (!plate) {
          return { summary: 'Не вказано номер авто', rows: [] };
        }

        const sql =
          `SELECT z.KOD, z.NUMDOC, z.DATDOC, z.AM, z.PR, z.MARSH, z.PUNKTZ, z.PUNKTR, ` +
          `z.DATZAV, z.DATROZV, z.VANTAZH, z.VOD1, z.VOD1TEL, f.NFIRMA AS PEREVIZNYK ` +
          `FROM ZAY z LEFT JOIN PEREV p ON z.KOD_PER = p.KOD LEFT JOIN FIRMA f ON p.KOD_FIRMA = f.KOD ` +
          `WHERE UPPER(z.AM) LIKE :plate ORDER BY z.DATZAV DESC FETCH FIRST 5 ROWS ONLY`;

        const result = await this.readOnly.run(sql, 'oracle', {
          userId: ctx.user?.id,
          source: 'getTruckLocation',
        }, { plate: `%${plate}%` });

        return {
          summary: result.rowCount
            ? `Знайдено останні рейси авто ${plate}: ${result.rowCount}. Це остання відома заявка, не GPS-координати.`
            : `Рейсів по авто ${plate} не знайдено`,
          rows: result.rows,
          rowCount: result.rowCount,
          meta: { plate, note: 'GPS-трекінг відсутній', source: 'Oracle ZAY' },
        };
      },
    };
  }

  private getDriverStatus(): AiTool {
    return {
      name: 'getDriverStatus',
      description:
        'Останні рейси водія за прізвищем: маршрут, дати, авто, вантаж, перевізник. ' +
        'Використовуй для питань про водія, його завантаження й поточні рейси.',
      parameters: {
        type: 'object',
        properties: {
          driverName: {
            type: 'string',
            description: 'Прізвище водія або його частина',
          },
        },
        required: ['driverName'],
      },
      execute: async (args, ctx): Promise<ToolResult> => {
        const driver = String(args.driverName ?? '').trim().toUpperCase();
        if (!driver) {
          return { summary: 'Не вказано прізвище водія', rows: [] };
        }

        const sql =
          `SELECT z.KOD, z.NUMDOC, z.DATDOC, z.VOD1, z.VOD1TEL, z.AM, z.MARSH, ` +
          `z.PUNKTZ, z.PUNKTR, z.DATZAV, z.DATROZV, z.VANTAZH, f.NFIRMA AS PEREVIZNYK ` +
          `FROM ZAY z LEFT JOIN PEREV p ON z.KOD_PER = p.KOD LEFT JOIN FIRMA f ON p.KOD_FIRMA = f.KOD ` +
          `WHERE UPPER(z.VOD1) LIKE :driver ORDER BY z.DATZAV DESC FETCH FIRST 10 ROWS ONLY`;

        const result = await this.readOnly.run(sql, 'oracle', {
          userId: ctx.user?.id,
          source: 'getDriverStatus',
        }, { driver: `%${driver}%` });

        return {
          summary: result.rowCount
            ? `Знайдено рейсів водія «${args.driverName}»: ${result.rowCount}`
            : `Рейсів водія «${args.driverName}» не знайдено`,
          rows: result.rows,
          rowCount: result.rowCount,
          meta: { source: 'Oracle ZAY' },
        };
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Фінанси (лише для ICT / адміністраторів)
  // ─────────────────────────────────────────────────────────────

  private getClientDebt(): AiTool {
    return {
      name: 'getClientDebt',
      description:
        'Фінансовий підсумок по клієнту: сума виставлених місячних актів (нараховано) і сума отриманих банківських платежів (оплачено), різниця = заборгованість. ' +
        'Використовуй для питань про борг, оплату, дебіторку клієнта. Доступно лише співробітникам ICT.',
      roles: ['ict', 'admin'],
      parameters: {
        type: 'object',
        properties: {
          clientName: {
            type: 'string',
            description: 'Назва компанії-клієнта або її частина',
          },
        },
        required: ['clientName'],
      },
      execute: async (args, ctx): Promise<ToolResult> => {
        const client = String(args.clientName ?? '').trim().toUpperCase();
        if (!client) {
          return { summary: 'Не вказано назву клієнта', rows: [] };
        }

        // Нараховано — місячні акти по контрактах компанії
        const billedSql =
          `SELECT f.KOD, f.NFIRMA, SUM(a.SUMA) AS NARAHOVANO, COUNT(a.KOD) AS AKTIV ` +
          `FROM AVRMONCLIENT a JOIN DOG d ON a.KOD_DOG = d.KOD JOIN FIRMA f ON d.KOD_FIRMA = f.KOD ` +
          `WHERE UPPER(f.NFIRMA) LIKE :client GROUP BY f.KOD, f.NFIRMA ORDER BY SUM(a.SUMA) DESC`;

        // Оплачено — банківські надходження, привʼязані до заявок цього замовника
        const paidSql =
          `SELECT f.KOD, f.NFIRMA, SUM(b.SUMA) AS OPLACHENO, COUNT(b.KOD) AS PLATEZHIV ` +
          `FROM BANKP b JOIN ZAY z ON b.KOD_ZAY = z.KOD JOIN FIRMA f ON z.KOD_ZAM = f.KOD ` +
          `WHERE UPPER(f.NFIRMA) LIKE :client GROUP BY f.KOD, f.NFIRMA ORDER BY SUM(b.SUMA) DESC`;

        const [billed, paid] = await Promise.all([
          this.readOnly.run(billedSql, 'oracle', {
            userId: ctx.user?.id,
            source: 'getClientDebt.billed',
          }, { client: `%${client}%` }),
          this.readOnly.run(paidSql, 'oracle', {
            userId: ctx.user?.id,
            source: 'getClientDebt.paid',
          }, { client: `%${client}%` }),
        ]);

        // Зводимо два розрізи по коду фірми — борг рахуємо на бекенді, не в моделі
        const byKod = new Map<number, any>();
        for (const row of billed.rows) {
          byKod.set(row.KOD, {
            client: row.NFIRMA,
            narahovano: Number(row.NARAHOVANO ?? 0),
            aktiv: Number(row.AKTIV ?? 0),
            oplacheno: 0,
            platezhiv: 0,
          });
        }
        for (const row of paid.rows) {
          const entry = byKod.get(row.KOD) ?? {
            client: row.NFIRMA,
            narahovano: 0,
            aktiv: 0,
            oplacheno: 0,
            platezhiv: 0,
          };
          entry.oplacheno = Number(row.OPLACHENO ?? 0);
          entry.platezhiv = Number(row.PLATEZHIV ?? 0);
          byKod.set(row.KOD, entry);
        }

        const rows = [...byKod.values()].map((e) => ({
          ...e,
          narahovano: Number(e.narahovano.toFixed(2)),
          oplacheno: Number(e.oplacheno.toFixed(2)),
          zaborhovanist: Number((e.narahovano - e.oplacheno).toFixed(2)),
        }));

        return {
          summary: rows.length
            ? `Знайдено клієнтів за запитом «${args.clientName}»: ${rows.length}. Заборгованість = нараховано мінус оплачено.`
            : `Клієнта «${args.clientName}» не знайдено у фінансових документах`,
          rows,
          rowCount: rows.length,
          meta: {
            source: 'Oracle AVRMONCLIENT + BANKP',
            note: 'Оплати враховані ті, що привʼязані до заявок клієнта',
          },
        };
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Звіти
  // ─────────────────────────────────────────────────────────────

  private generateReport(): AiTool {
    // Звіт прибутковості живе в Oracle — при вимкненому джерелі модель його не бачить
    const reports = this.readOnly.isOracleEnabled()
      ? ['tenders_by_department', 'carrier_activity', 'profit']
      : ['tenders_by_department', 'carrier_activity'];

    return {
      name: 'generateReport',
      description:
        'Агрегований управлінський звіт. Типи: ' +
        'tenders_by_department — тендери за відділами (кількість, статуси, ставки перевізників, середня стартова ціна); ' +
        'carrier_activity — активність перевізників (кількість ставок, середня ставка)' +
        (this.readOnly.isOracleEnabled()
          ? '; profit — прибутковість рейсів з Oracle (сума замовника мінус сума перевізника). '
          : '. ') +
        'Використовуй для питань «створи звіт», «покажи статистику», «звіт перед нарадою». Доступно лише співробітникам ICT.',
      roles: ['ict', 'admin'],
      parameters: {
        type: 'object',
        properties: {
          report: {
            type: 'string',
            enum: reports,
            description: 'Тип звіту',
          },
          period: { type: 'string', enum: PERIOD_ENUM, description: 'Період' },
          dateFrom: { type: 'string', description: 'Дата від, YYYY-MM-DD' },
          dateTo: { type: 'string', description: 'Дата до, YYYY-MM-DD' },
        },
        required: ['report', 'period'],
      },
      execute: async (args, ctx): Promise<ToolResult> => {
        const period = resolvePeriod(args);
        const report = String(args.report ?? 'tenders_by_department');

        if (report === 'profit' && !this.readOnly.isOracleEnabled()) {
          return {
            summary:
              'Звіт прибутковості будується з Oracle, а це джерело зараз вимкнено. Доступні звіти по тендерах і перевізниках із Postgres.',
            rows: [],
            meta: { report, disabled: 'oracle' },
          };
        }

        if (report === 'profit') {
          const sql =
            `SELECT TO_CHAR(z.DATZAV, 'YYYY-MM') AS PERIOD, COUNT(z.KOD) AS REYSIV, ` +
            `ROUND(SUM(z.ZAMSUMA), 2) AS DOHID, ROUND(SUM(z.PERSUMA), 2) AS VYTRATY, ` +
            `ROUND(SUM(z.ZAMSUMA) - SUM(z.PERSUMA), 2) AS PRYBUTOK ` +
            `FROM ZAY z WHERE z.DATZAV >= TO_DATE(:date_from, 'YYYY-MM-DD') ` +
            `AND z.DATZAV < TO_DATE(:date_to, 'YYYY-MM-DD') + 1 ` +
            `GROUP BY TO_CHAR(z.DATZAV, 'YYYY-MM') ORDER BY 1 DESC`;

          const result = await this.readOnly.run(sql, 'oracle', {
            userId: ctx.user?.id,
            source: 'generateReport.profit',
          }, { date_from: period.from, date_to: period.to });

          return {
            summary: `Звіт прибутковості за ${period.label}: періодів ${result.rowCount}`,
            rows: result.rows,
            rowCount: result.rowCount,
            meta: { report, period: period.label, source: 'Oracle ZAY' },
          };
        }

        if (report === 'carrier_activity') {
          const sql =
            `SELECT c.company_name AS carrier, COUNT(r.id) AS stavok, ` +
            `COUNT(DISTINCT r.id_tender) AS tenderiv, ROUND(AVG(r.price_proposed), 2) AS serednia_stavka ` +
            `FROM tender_rate r JOIN company c ON r.id_company = c.id ` +
            `WHERE r.time_add >= $1::date AND r.time_add < ($2::date + 1) ` +
            `GROUP BY c.company_name ORDER BY COUNT(r.id) DESC`;

          const result = await this.readOnly.run(sql, 'postgres', {
            userId: ctx.user?.id,
            source: 'generateReport.carrier_activity',
          }, [period.from, period.to]);

          return {
            summary: `Активність перевізників за ${period.label}: компаній ${result.rowCount}`,
            rows: result.rows,
            rowCount: result.rowCount,
            meta: { report, period: period.label, source: 'Postgres tender_rate' },
          };
        }

        // tenders_by_department — відділ тендера визначається за його автором
        const sql =
          `SELECT d.department_name AS viddil, COUNT(DISTINCT t.id) AS tenderiv, ` +
          `COUNT(DISTINCT t.id) FILTER (WHERE tl.ids_status = 'ACTIVE') AS aktyvnyh, ` +
          `COUNT(DISTINCT t.id) FILTER (WHERE tl.ids_status = 'CLOSED') AS zakrytyh, ` +
          `COUNT(r.id) AS stavok, COUNT(DISTINCT r.id_company) AS pereviznykiv, ` +
          `ROUND(AVG(t.price_start), 2) AS serednia_startova ` +
          `FROM tender t ` +
          `JOIN person p ON t.id_author = p.id ` +
          `JOIN person_department pd ON pd.id_person = p.id ` +
          `JOIN department d ON d.id = pd.id_department ` +
          `LEFT JOIN tender_lst tl ON tl.id_tender = t.id ` +
          `LEFT JOIN tender_rate r ON r.id_tender = t.id ` +
          `WHERE t.created_at >= $1::date AND t.created_at < ($2::date + 1) ` +
          `AND d.root_company IS NULL ` +
          `GROUP BY d.department_name ORDER BY COUNT(DISTINCT t.id) DESC`;

        const result = await this.readOnly.run(sql, 'postgres', {
          userId: ctx.user?.id,
          source: 'generateReport.tenders_by_department',
        }, [period.from, period.to]);

        return {
          summary: `Звіт по тендерах за відділами за ${period.label}: відділів ${result.rowCount}`,
          rows: result.rows,
          rowCount: result.rowCount,
          meta: { report, period: period.label, source: 'Postgres tender' },
        };
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Документи
  // ─────────────────────────────────────────────────────────────

  private searchDocuments(): AiTool {
    return {
      name: 'searchDocuments',
      description:
        'Пошук завантажених файлів і сканів за назвою: тип файлу, розмір, до якої сутності привʼязаний. ' +
        'Використовуй для питань «знайди документ», «де скан», «які файли по тендеру».',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Частина назви файлу для пошуку',
          },
          tblref: {
            type: 'string',
            description: 'Обмежити сутністю: company, tender, crm_load тощо',
          },
        },
        required: ['query'],
      },
      execute: async (args, ctx): Promise<ToolResult> => {
        const query = String(args.query ?? '').trim();
        if (!query) {
          return { summary: 'Не вказано, що шукати', rows: [] };
        }
        const tblref =
          typeof args.tblref === 'string' && args.tblref.trim()
            ? args.tblref.trim()
            : null;

        const sql =
          `SELECT f.id, f.display_name, f.extension, f.file_size, f.tblref, f.id_tblref ` +
          `FROM files f WHERE f.display_name ILIKE $1 ` +
          `AND ($2::text IS NULL OR f.tblref = $2) ORDER BY f.id DESC`;

        const result = await this.readOnly.run(sql, 'postgres', {
          userId: ctx.user?.id,
          source: 'searchDocuments',
        }, [`%${query}%`, tblref]);

        return {
          summary: `Знайдено файлів за запитом «${query}»: ${result.rowCount}`,
          rows: result.rows,
          rowCount: result.rowCount,
          truncated: result.truncated,
          meta: { source: 'Postgres files' },
        };
      },
    };
  }
}
