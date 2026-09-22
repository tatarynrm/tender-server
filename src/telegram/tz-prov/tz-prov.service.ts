import { Injectable, Logger } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { DatabaseOracleService } from 'src/database-oracle/database-oracle.service';

/**
 * «Проведення номерів» — внесення тягачів/причепів у транспорт перевізника (ICTDAT.URTP)
 * тими самими процедурами, що й у програмі Тараса:
 *   UR_$$PKG.AmToTP / PrToTP (перевізник, дата_з, дата_по) → kod-и TZAM/TZPR через кому:
 *     авто/причепи з ПРОВЕДЕНИХ заявок перевізника за період, яких ще немає в URTP;
 *   UR_$$PKG.AddAmToTP / AddPrToTP (перевізник, kod-и) → insert в URTP + COMMIT усередині.
 * Після цього URTP_$$PKG.ErrorIfNoUs пропускає заявки з цими номерами при проведенні.
 *
 * Номер, якого ще не було в жодній проведеній заявці, цими процедурами внести не можна
 * (його немає в TZAM/TZPR) — на це потрібна окрема процедура від Тараса.
 */
export type TzKind = 'am' | 'pr';

export interface TzItem {
  kod: string;
  dernom: string;
  marka: string | null;
}

export interface TzCarrier {
  kod: string;
  name: string;
  zkpo: string | null;
  count?: number;
}

export interface TzProvResult {
  requested: number;
  /** Вибрані, але вже не непроведені (провів хтось інший / змінились дані) */
  skipped: string[];
  applied: { dernom: string; notOwned: boolean }[];
  failed: string[];
  error?: string;
}

// Імена з фіксованої мапи, не з вводу користувача — безпечно підставляти в SQL
const KIND_SQL: Record<TzKind, { listFn: string; addProc: string; table: string; zayCol: string }> = {
  am: { listFn: 'ictdat.ur_$$pkg.AmToTP', addProc: 'ictdat.ur_$$pkg.AddAmToTP', table: 'ictdat.tzam', zayCol: 'am' },
  pr: { listFn: 'ictdat.ur_$$pkg.PrToTP', addProc: 'ictdat.ur_$$pkg.AddPrToTP', table: 'ictdat.tzpr', zayCol: 'pr' },
};

/** Скільки kod-ів передавати в один виклик процедури */
const ADD_CHUNK = 150;

export class TzTooManyError extends Error {}

@Injectable()
export class TzProvService {
  private readonly logger = new Logger(TzProvService.name);

  constructor(private readonly oracle: DatabaseOracleService) {}

  /** Перевізники, у яких є непроведені номери за період (та сама вибірка, що в AmToTP/PrToTP). */
  async carriersWithPending(kind: TzKind, days: number): Promise<TzCarrier[]> {
    const k = KIND_SQL[kind];
    const rows = await this.oracle.executeReadOnlyQuery<any>(
      `SELECT u.kod, u.nur, u.zkpo, COUNT(*) cnt
         FROM (SELECT DISTINCT z.kod_per, z.${k.zayCol} dernom
                 FROM ictdat.zay z
                WHERE z.kod_per IS NOT NULL
                  AND z.${k.zayCol} IS NOT NULL
                  -- N днів = сьогодні + (N-1) попередніх календарних днів (2 дні = сьогодні й учора)
                  AND z.datprov >= TRUNC(SYSDATE) - :days + 1
                  AND z.datprov <= SYSDATE) x
         JOIN ${k.table} t ON t.kod_ur = x.kod_per AND t.dernom = x.dernom
         JOIN ictdat.ur u ON u.kod = x.kod_per
        WHERE NOT EXISTS (SELECT 1 FROM ictdat.urtp p WHERE p.kod_ur = x.kod_per AND p.dernom = x.dernom)
        GROUP BY u.kod, u.nur, u.zkpo
        ORDER BY cnt DESC, u.nur
        FETCH FIRST 20 ROWS ONLY`,
      { days },
    );
    return rows.map((r) => ({
      kod: String(r.KOD),
      name: r.NUR ?? `#${r.KOD}`,
      zkpo: r.ZKPO ?? null,
      count: Number(r.CNT),
    }));
  }

  /** Пошук перевізника за частиною назви або ЄДРПОУ. */
  async searchCarriers(text: string): Promise<TzCarrier[]> {
    const q = text.trim();
    if (q.length < 2) return [];
    const like = `%${q.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.oracle.executeReadOnlyQuery<any>(
      `SELECT kod, nur, zkpo
         FROM ictdat.ur
        WHERE datend IS NULL
          AND (UPPER(nur) LIKE :q ESCAPE '\\' OR zkpo = :z)
        ORDER BY nur
        FETCH FIRST 10 ROWS ONLY`,
      { q: like, z: q },
    );
    return rows.map((r) => ({ kod: String(r.KOD), name: r.NUR ?? `#${r.KOD}`, zkpo: r.ZKPO ?? null }));
  }

  async getCarrier(kodPer: string): Promise<TzCarrier | null> {
    const rows = await this.oracle.executeReadOnlyQuery<any>(
      `SELECT kod, nur, zkpo FROM ictdat.ur WHERE kod = :k`,
      { k: Number(kodPer) },
    );
    const r = rows[0];
    return r ? { kod: String(r.KOD), name: r.NUR ?? `#${r.KOD}`, zkpo: r.ZKPO ?? null } : null;
  }

  /** Непроведені номери перевізника — через AmToTP/PrToTP, як у програмі. */
  async getPending(kodPer: string, kind: TzKind, days: number): Promise<TzItem[]> {
    const k = KIND_SQL[kind];
    let kods: string | null;
    try {
      const out = await this.oracle.executePlsql<{ ret: string | null }>(
        // Той самий відлік днів, що й у carriersWithPending — інакше лічильник і список розійдуться
        `BEGIN :ret := ${k.listFn}(:per, TRUNC(SYSDATE) - :days + 1, SYSDATE); END;`,
        {
          ret: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
          per: Number(kodPer),
          days,
        },
      );
      kods = out.ret;
    } catch (e: any) {
      // Функція збирає список у varchar2(4000): задовгий період → переповнення
      if (String(e?.message).includes('ORA-06502')) {
        throw new TzTooManyError('Забагато номерів за період');
      }
      throw e;
    }
    if (!kods) return [];

    const rows = await this.oracle.executeReadOnlyQuery<any>(
      `SELECT kod, dernom, marka
         FROM ${k.table}
        WHERE kod_ur = :per
          AND INSTR(',' || :kods || ',', ',' || kod || ',') > 0
        ORDER BY dernom`,
      { per: Number(kodPer), kods },
    );
    return rows.map((r) => ({ kod: String(r.KOD), dernom: r.DERNOM, marka: r.MARKA ?? null }));
  }

  /**
   * Провести вибрані номери. Вибір звіряємо зі свіжим списком AmToTP/PrToTP —
   * передаємо в процедуру лише kod-и, які досі непроведені саме в цього перевізника.
   */
  async provesti(
    kodPer: string,
    kind: TzKind,
    days: number,
    selectedKods: string[],
    /** Хто проводить — мітка сесії Oracle для аудиту, напр. 'tg:123456' */
    actor?: string,
  ): Promise<TzProvResult> {
    const k = KIND_SQL[kind];
    const fresh = await this.getPending(kodPer, kind, days);
    const byKod = new Map(fresh.map((i) => [i.kod, i]));
    const toApply = [...new Set(selectedKods)].filter((kod) => byKod.has(kod));
    const skipped = selectedKods.filter((kod) => !byKod.has(kod));

    const result: TzProvResult = { requested: selectedKods.length, skipped, applied: [], failed: [] };
    if (!toApply.length) return result;

    try {
      for (let i = 0; i < toApply.length; i += ADD_CHUNK) {
        // Рядок kod-ів через кому, без пробілів і коми в кінці — так його розбирає p_utils.CountStr
        const chunk = toApply.slice(i, i + ADD_CHUNK).join(',');
        await this.oracle.executePlsql(
          `BEGIN ${k.addProc}(:per, :kods); END;`,
          { per: Number(kodPer), kods: chunk },
          { clientId: actor?.slice(0, 64), module: 'tender-bot', action: 'tz-prov' },
        );
      }
    } catch (e: any) {
      // Попередні пачки вже закомічені процедурою — нижче звіряємо, що реально внеслось
      result.error = this.oracleMessage(e);
    }

    // Що реально з'явилося в URTP (тригер нормалізує номер тим самим p_main.dernom)
    const dernoms = toApply.map((kod) => byKod.get(kod)!.dernom);
    const rows = await this.oracle.executeReadOnlyQuery<any>(
      `SELECT dernom, NVL(novl, 0) novl
         FROM ictdat.urtp
        WHERE kod_ur = :per
          AND INSTR('|' || :d || '|', '|' || dernom || '|') > 0`,
      { per: Number(kodPer), d: dernoms.join('|') },
    );
    const inUrtp = new Map(rows.map((r) => [String(r.DERNOM), Number(r.NOVL) === 1]));
    for (const dernom of dernoms) {
      if (inUrtp.has(dernom)) result.applied.push({ dernom, notOwned: inUrtp.get(dernom)! });
      else result.failed.push(dernom);
    }
    return result;
  }

  /** Текст помилки Oracle без стеку; p_utils.RunError кидає ORA-20xxx з людським повідомленням. */
  private oracleMessage(e: any): string {
    const msg = String(e?.message ?? e ?? 'Невідома помилка');
    const m = msg.match(/ORA-20\d{3}:\s*([^\n]+)/);
    return (m ? m[1] : msg.split('\n')[0]).slice(0, 300);
  }
}
