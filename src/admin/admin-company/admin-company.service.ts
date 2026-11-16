import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { DatabaseService } from 'src/database/database.service';
import { DatabaseOracleService } from 'src/database-oracle/database-oracle.service';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';

// Компанії, імпортовані з Oracle (NORIS), завжди мають migrate_company = 'ICT',
// а migrate_id = ur.kod з Oracle.
const MIGRATE_COMPANY = 'ICT';

// Організаційно-правові форми, які заважають пошуку назви в Oracle (ur.nur
// зазвичай без них або в іншому написанні).
const LEGAL_FORMS = [
  'ТОВАРИСТВО З ОБМЕЖЕНОЮ ВІДПОВІДАЛЬНІСТЮ',
  'ФІЗИЧНА ОСОБА-ПІДПРИЄМЕЦЬ',
  'ФІЗИЧНА ОСОБА ПІДПРИЄМЕЦЬ',
  'ПРИВАТНЕ ПІДПРИЄМСТВО',
  'ПРИВАТНЕ АКЦІОНЕРНЕ ТОВАРИСТВО',
  'АКЦІОНЕРНЕ ТОВАРИСТВО',
  'ТЗОВ',
  'ТОВ',
  'ФОП',
  'ПРАТ',
  'ПАТ',
  'ПП',
  'АТ',
  'ДП',
  'LLC',
  'LTD',
  'SP. Z O.O.',
  'SP Z O O',
  'SP.Z O.O.',
];

export interface OracleCandidate {
  kod: number;
  nur: string | null;
  zkpo: string | null;
  fo: number | null;
  nadr: string | null;
  match: 'edrpou' | 'name';
  // Якщо цей kod уже прив'язаний до іншої компанії в Postgres
  linked_company?: { id: number; company_name: string } | null;
}

@Authorization()
@Injectable()
export class AdminCompanyService {
  public constructor(
    private readonly dbservice: DatabaseService,
    private readonly oracleService: DatabaseOracleService,
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

  /** Нормалізує migrate_*: якщо є migrate_id — migrate_company завжди 'ICT'. */
  private normalizeMigrate(dto: any) {
    const raw = dto?.migrate_id;
    const hasId = raw !== undefined && raw !== null && String(raw).trim() !== '';
    return hasId
      ? { migrate_id: String(raw).trim(), migrate_company: MIGRATE_COMPANY }
      : { migrate_id: null, migrate_company: dto?.migrate_company ?? null };
  }

  async saveCompany(dto: any) {
    // company_save при update перезаписує ВСІ колонки (відсутні ключі → NULL),
    // а форма шле лише частину полів. Тому при редагуванні накладаємо зміни
    // на повний поточний рядок з company_one.
    let current: any = {};
    if (dto?.id) {
      const one = await this.dbservice.callProcedure('company_one', { id: Number(dto.id) }, {});
      const row = Array.isArray(one?.content) ? one.content[0] : one?.content;
      if (row?.id) current = row;
    }

    const payload = {
      ...current,
      ...dto,
      edrpou: dto.edrpou?.trim?.() ? dto.edrpou.trim() : (dto.edrpou || null),
      ids_members_exp: dto.ids_members_exp || null,
      ids_members_imp: dto.ids_members_imp || null,
      ids_members_reg: dto.ids_members_reg || null,
      ...this.normalizeMigrate({ ...current, ...dto }),
    };

    const result = await this.dbservice.callProcedure('company_save', payload, {});

    return result;
  }
  async findAll(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);

    const result = await this.dbservice.callProcedure('company_list', {
      pagination: {
        per_page: query.limit ?? 50,
        page: query.page ?? 1,
      },
      filter: filters,
    });

    return result;
  }
  async findOne(id: number) {
    const result = await this.dbservice.callProcedure(
      'company_one',
      { id: id },
      {},
    );

    return result;
  }
  async getCompanyPre(id: number) {
    const result = await this.dbservice.callProcedure(
      'usr_pre_register_one',
      { id: id },
      {},
    );

    return result;
  }

  // ===================== NORIS (зв'язок з Oracle) =====================

  /** Прибирає лапки та орг.-правові форми з назви для пошуку в ur.nur. */
  private cleanName(name: string | null | undefined): string {
    let s = (name || '').toUpperCase();
    s = s.replace(/["«»“”„'`’]/g, ' ');
    for (const form of LEGAL_FORMS) {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'g'), ' ');
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  private async searchOracle(
    edrpou: string | null,
    name: string | null,
  ): Promise<OracleCandidate[]> {
    const select = `
      select a.kod as "kod",
             a.nur as "nur",
             a.zkpo as "zkpo",
             a.fo as "fo",
             (select b.nadr
                from uradr b
               where b.kod_ur = a.kod and b.ur > 0 and rownum < 2) as "nadr"
        from ur a`;

    const byKod = new Map<number, OracleCandidate>();

    const code = (edrpou || '').trim();
    if (/^\d{8,10}$/.test(code)) {
      const rows = await this.oracleService.executeQuery<any>(
        `${select} where a.zkpo = :z and rownum <= 5`,
        { z: code },
      );
      for (const r of rows) byKod.set(Number(r.kod), { ...r, match: 'edrpou' });
    }

    const q = this.cleanName(name);
    if (q.length >= 3) {
      const rows = await this.oracleService.executeQuery<any>(
        `${select} where upper(a.nur) like '%' || :q || '%' and rownum <= 8`,
        { q },
      );
      for (const r of rows) {
        const k = Number(r.kod);
        if (!byKod.has(k)) byKod.set(k, { ...r, match: 'name' });
      }
    }

    return [...byKod.values()];
  }

  /**
   * Компанії без migrate_id + кандидати з Oracle для кожної (пошук за ЄДРПОУ
   * та назвою). Посторінково, щоб не бити Oracle сотнями запитів за раз.
   */
  async norisUnlinked(pageRaw?: string, limitRaw?: string) {
    const limit = Math.min(Math.max(Number(limitRaw) || 20, 1), 50);
    const page = Math.max(Number(pageRaw) || 1, 1);

    const totalRes = await this.pool.query(
      `select count(*)::int as total from company where migrate_id is null`,
    );
    const total: number = totalRes.rows[0]?.total ?? 0;

    const listRes = await this.pool.query(
      `select id, company_name, company_name_full, edrpou, address
         from company
        where migrate_id is null
        order by company_name nulls last, id
        limit $1 offset $2`,
      [limit, (page - 1) * limit],
    );

    const rows: any[] = [];
    for (const c of listRes.rows) {
      const name = c.company_name_full || c.company_name;
      let candidates: OracleCandidate[] = [];
      let error: string | null = null;
      try {
        candidates = await this.searchOracle(c.edrpou, name);
        // Якщо за повною назвою нічого — пробуємо коротку
        if (
          !candidates.length &&
          c.company_name &&
          c.company_name !== c.company_name_full
        ) {
          candidates = await this.searchOracle(null, c.company_name);
        }
      } catch (e: any) {
        // Збій Oracle по одній компанії не валить увесь список
        error = e?.message || 'Помилка пошуку в Oracle';
      }
      rows.push({ ...c, candidates, error });
    }

    // Позначаємо kod, які вже зайняті іншими компаніями
    const kods = [
      ...new Set(rows.flatMap((r) => r.candidates.map((x) => String(x.kod)))),
    ];
    if (kods.length) {
      const linked = await this.pool.query(
        `select id, company_name, migrate_id
           from company
          where migrate_company = $1 and migrate_id = any($2::text[])`,
        [MIGRATE_COMPANY, kods],
      );
      const byKod = new Map(linked.rows.map((r) => [String(r.migrate_id), r]));
      for (const r of rows) {
        for (const cand of r.candidates) {
          const l = byKod.get(String(cand.kod));
          cand.linked_company = l
            ? { id: l.id, company_name: l.company_name }
            : null;
        }
      }
    }

    return {
      rows,
      total,
      page,
      limit,
      page_count: Math.max(Math.ceil(total / limit), 1),
    };
  }

  /**
   * Встановлює migrate_id компанії. company_save перезаписує ВСІ колонки,
   * тож беремо повний рядок з company_one і змінюємо лише migrate_*.
   */
  async norisLink(dto: { id: number; migrate_id: number | string }) {
    const id = Number(dto?.id);
    const kod = String(dto?.migrate_id ?? '').trim();
    if (!id || !/^\d+$/.test(kod)) {
      throw new BadRequestException('Потрібні id компанії та числовий migrate_id');
    }

    const taken = await this.pool.query(
      `select id, company_name from company
        where migrate_company = $1 and migrate_id = $2 and id <> $3
        limit 1`,
      [MIGRATE_COMPANY, kod, id],
    );
    if (taken.rows.length) {
      const t = taken.rows[0];
      throw new BadRequestException(
        `Код ${kod} уже прив'язаний до компанії «${t.company_name}» (id ${t.id})`,
      );
    }

    const one = await this.dbservice.callProcedure('company_one', { id }, {});
    const row = Array.isArray(one?.content) ? one.content[0] : one?.content;
    if (!row || !row.id) {
      throw new BadRequestException(`Компанію id ${id} не знайдено`);
    }

    const result = await this.dbservice.callProcedure(
      'company_save',
      { ...row, migrate_id: kod, migrate_company: MIGRATE_COMPANY },
      {},
    );
    return result;
  }
}
