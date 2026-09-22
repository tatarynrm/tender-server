import { Injectable, Logger } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { DatabaseOracleService } from 'src/database-oracle/database-oracle.service';

/**
 * «Проведення номерів» — внесення тягачів/причепів у транспорт перевізника (ICTDAT.URTP).
 * Два джерела номерів:
 *
 * 1. hist — номери з ПРОВЕДЕНИХ заявок, які вже є в довідниках TZAM/TZPR. Список і
 *    проведення — процедурами з програми Тараса:
 *      UR_$$PKG.AmToTP / PrToTP (перевізник, дата_з, дата_по) → kod-и TZAM/TZPR через кому;
 *      UR_$$PKG.AddAmToTP / AddPrToTP (перевізник, kod-и) → insert в URTP + COMMIT усередині.
 *
 * 2. new — номери з НЕПРОВЕДЕНИХ заявок, яких ще немає ніде (саме через них заявка не
 *    проходить URTP_$$PKG.ErrorIfNoUs при проведенні). Процедури Тараса їх не бачать, а
 *    окремої процедури для нового номера в базі немає — тому вставляємо в URTP самі, тими
 *    самими полями й логікою, що й AddAmToTP (novl=0, при конфлікті власника — novl=1).
 *    Рішення погоджене власником проєкту; тригери URTP нормалізують номер, ставлять
 *    USTZ=1 і пишуть аудит (tblctrl).
 */
export type TzKind = 'am' | 'pr';
export type TzSource = 'hist' | 'new';

export interface TzItem {
  /** Ключ вибору: 'h<kod TZAM/TZPR>' або 'n<номер>' */
  key: string;
  dernom: string;
  marka: string | null;
  source: TzSource;
  /** kod у TZAM/TZPR — лише для hist */
  kod?: string;
  /** Номер (найменший) непроведеної заявки з цим номером і скільки їх — лише для new */
  /**
   * Остання заявка перевізника з цим номером за період (new — непроведена, hist — проведена)
   * і скільки всього таких заявок — щоб біля номера машини було видно № заявки.
   */
  zayNum?: string;
  zayCount?: number;
}

export interface TzCarrier {
  kod: string;
  name: string;
  zkpo: string | null;
  count?: number;
  /** Скільки з них — нові номери з непроведених заявок */
  newCount?: number;
}

export interface TzProvResult {
  requested: number;
  /** Вибрані, але вже не непроведені (провів хтось інший / змінились дані) */
  skipped: string[];
  applied: { dernom: string; notOwned: boolean; source: TzSource; zayNum?: string }[];
  failed: string[];
  error?: string;
}

// Імена з фіксованої мапи, не з вводу користувача — безпечно підставляти в SQL
const KIND_SQL: Record<
  TzKind,
  { listFn: string; addProc: string; table: string; zayCol: string; markCol: string; tyag: number }
> = {
  am: { listFn: 'ictdat.ur_$$pkg.AmToTP', addProc: 'ictdat.ur_$$pkg.AddAmToTP', table: 'ictdat.tzam', zayCol: 'am', markCol: 'ammark', tyag: 1 },
  pr: { listFn: 'ictdat.ur_$$pkg.PrToTP', addProc: 'ictdat.ur_$$pkg.AddPrToTP', table: 'ictdat.tzpr', zayCol: 'pr', markCol: 'prmark', tyag: 0 },
};

/** Скільки kod-ів передавати в один виклик AddAmToTP/AddPrToTP */
const ADD_CHUNK = 150;

/**
 * Номери з непроведених заявок (new). Скасовані заявки (статус менеджера CANCEL*) не беремо.
 * Перевізників з UR.ENABLEAM=1 («Дозволити їхати АМ без перевірки») теж: ErrorIfNoUs їх не
 * перевіряє, тож їхні номери нічого не блокують і вносити їх як «власні» не треба.
 * Номер — лише звичайного вигляду: поле причепа в заявці до 500 символів і інколи містить
 * кілька номерів, а URTP.DERNOM — 50 байт.
 */
function newPlatesSql(col: string, markCol: string, perFilter: boolean) {
  return `
    SELECT x.kod_per, x.dernom, x.marka, x.num_last, x.cnt
      FROM (SELECT z.kod_per,
                   ictdat.p_main.dernom(z.${col}) dernom,
                   MAX(z.${markCol}) marka,
                   -- № найсвіжішої заявки з цим номером (номери заявок повторюються з року в рік)
                   MAX(z.num) KEEP (DENSE_RANK LAST ORDER BY z.dat, z.kod) num_last,
                   COUNT(*) cnt
              FROM ictdat.zay z
              JOIN ictdat.ur u ON u.kod = z.kod_per AND NVL(u.enableam, 0) = 0
             WHERE z.datprov IS NULL
               AND z.kod_per IS NOT NULL
               ${perFilter ? 'AND z.kod_per = :per' : ''}
               AND z.${col} IS NOT NULL
               AND z.dat >= TRUNC(SYSDATE) - :days + 1
               AND NVL(z.code_statusmen, '-') NOT LIKE 'CANCEL%'
             GROUP BY z.kod_per, ictdat.p_main.dernom(z.${col})) x
     WHERE x.dernom IS NOT NULL
       AND LENGTH(x.dernom) BETWEEN 4 AND 20
       AND INSTR(x.dernom, ',') = 0 AND INSTR(x.dernom, ';') = 0 AND INSTR(x.dernom, '/') = 0
       AND NOT EXISTS (SELECT 1 FROM ictdat.urtp p WHERE p.kod_ur = x.kod_per AND p.dernom = x.dernom)`;
}

export class TzTooManyError extends Error {}

@Injectable()
export class TzProvService {
  private readonly logger = new Logger(TzProvService.name);

  constructor(private readonly oracle: DatabaseOracleService) {}

  /**
   * Перевізники з непроведеними номерами за період: hist (та сама вибірка, що в AmToTP/PrToTP)
   * + new (номери з непроведених заявок). Лічимо унікальні номери на перевізника.
   */
  async carriersWithPending(kind: TzKind, days: number): Promise<TzCarrier[]> {
    const k = KIND_SQL[kind];
    const [hist, fresh] = await Promise.all([
      this.oracle.executeReadOnlyQuery<any>(
        `SELECT DISTINCT x.kod_per, x.dernom
           FROM (SELECT DISTINCT z.kod_per, z.${k.zayCol} dernom
                   FROM ictdat.zay z
                  WHERE z.kod_per IS NOT NULL
                    AND z.${k.zayCol} IS NOT NULL
                    -- N днів = сьогодні + (N-1) попередніх календарних днів (2 дні = сьогодні й учора)
                    AND z.datprov >= TRUNC(SYSDATE) - :days + 1
                    AND z.datprov <= SYSDATE) x
           JOIN ${k.table} t ON t.kod_ur = x.kod_per AND t.dernom = x.dernom
          WHERE NOT EXISTS (SELECT 1 FROM ictdat.urtp p WHERE p.kod_ur = x.kod_per AND p.dernom = x.dernom)`,
        { days },
      ),
      this.oracle.executeReadOnlyQuery<any>(newPlatesSql(k.zayCol, k.markCol, false), { days }),
    ]);

    const byCarrier = new Map<string, { plates: Set<string>; fresh: Set<string> }>();
    const bucket = (kod: string) => {
      let b = byCarrier.get(kod);
      if (!b) byCarrier.set(kod, (b = { plates: new Set(), fresh: new Set() }));
      return b;
    };
    for (const r of hist) bucket(String(r.KOD_PER)).plates.add(String(r.DERNOM));
    for (const r of fresh) {
      const b = bucket(String(r.KOD_PER));
      if (!b.plates.has(String(r.DERNOM))) {
        b.plates.add(String(r.DERNOM));
        b.fresh.add(String(r.DERNOM));
      }
    }

    const top = [...byCarrier.entries()]
      // Спочатку ті, в кого є нові номери (саме вони блокують заявки), далі — за кількістю
      .sort((a, b) => b[1].fresh.size - a[1].fresh.size || b[1].plates.size - a[1].plates.size)
      .slice(0, 20);
    if (!top.length) return [];

    const binds: Record<string, number> = {};
    top.forEach(([kod], i) => (binds[`k${i}`] = Number(kod)));
    const names = await this.oracle.executeReadOnlyQuery<any>(
      `SELECT kod, nur, zkpo FROM ictdat.ur WHERE kod IN (${top.map((_, i) => `:k${i}`).join(', ')})`,
      binds,
    );
    const nameByKod = new Map(names.map((r) => [String(r.KOD), r]));

    return top.map(([kod, b]) => {
      const n = nameByKod.get(kod);
      return {
        kod,
        name: n?.NUR ?? `#${kod}`,
        zkpo: n?.ZKPO ?? null,
        count: b.plates.size,
        newCount: b.fresh.size,
      };
    });
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

  /** Непроведені номери перевізника: hist через AmToTP/PrToTP (як у програмі) + new із непроведених заявок. */
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

    const items: TzItem[] = [];
    const seen = new Set<string>();

    if (kods) {
      const rows = await this.oracle.executeReadOnlyQuery<any>(
        `SELECT kod, dernom, marka
           FROM ${k.table}
          WHERE kod_ur = :per
            AND INSTR(',' || :kods || ',', ',' || kod || ',') > 0
          ORDER BY dernom, kod`,
        { per: Number(kodPer), kods },
      );
      // № останньої проведеної заявки перевізника з цим номером за період — показуємо біля номера.
      // Порівняння як в AmToTP: zay.am/pr = dernom довідника, без нормалізації.
      const zays = await this.oracle.executeReadOnlyQuery<any>(
        `SELECT z.${k.zayCol} dernom,
                MAX(z.num) KEEP (DENSE_RANK LAST ORDER BY z.datprov, z.kod) num_last,
                COUNT(*) cnt
           FROM ictdat.zay z
          WHERE z.kod_per = :per
            AND z.${k.zayCol} IS NOT NULL
            AND z.datprov >= TRUNC(SYSDATE) - :days + 1
            AND z.datprov <= SYSDATE
          GROUP BY z.${k.zayCol}`,
        { per: Number(kodPer), days },
      );
      const zayByPlate = new Map(zays.map((z) => [String(z.DERNOM), z]));

      for (const r of rows) {
        const dernom = String(r.DERNOM);
        // Дубль номера в довіднику (у TZPR немає унікального ключа) — AddPrToTP впав би на другому
        if (seen.has(dernom)) continue;
        seen.add(dernom);
        const z = zayByPlate.get(dernom);
        items.push({
          key: `h${r.KOD}`,
          dernom,
          marka: r.MARKA ?? null,
          source: 'hist',
          kod: String(r.KOD),
          zayNum: z?.NUM_LAST != null ? String(z.NUM_LAST) : undefined,
          zayCount: z ? Number(z.CNT) : undefined,
        });
      }
    }

    const fresh = await this.oracle.executeReadOnlyQuery<any>(
      `${newPlatesSql(k.zayCol, k.markCol, true)} ORDER BY x.dernom`,
      { per: Number(kodPer), days },
    );
    for (const r of fresh) {
      const dernom = String(r.DERNOM);
      if (seen.has(dernom)) continue;
      seen.add(dernom);
      items.push({
        key: `n${dernom}`,
        dernom,
        marka: r.MARKA ?? null,
        source: 'new',
        zayNum: r.NUM_LAST != null ? String(r.NUM_LAST) : undefined,
        zayCount: Number(r.CNT),
      });
    }

    // Нові номери (вони блокують заявки) — першими
    return items.sort((a, b) => (a.source === b.source ? a.dernom.localeCompare(b.dernom) : a.source === 'new' ? -1 : 1));
  }

  /**
   * Провести вибрані номери. Вибір звіряємо зі свіжим списком — у базу йдуть лише
   * номери, які досі непроведені саме в цього перевізника.
   */
  async provesti(
    kodPer: string,
    kind: TzKind,
    days: number,
    selectedKeys: string[],
    /** Хто проводить — мітка сесії Oracle для аудиту, напр. 'tg:123456' */
    actor?: string,
  ): Promise<TzProvResult> {
    const k = KIND_SQL[kind];
    const fresh = await this.getPending(kodPer, kind, days);
    const byKey = new Map(fresh.map((i) => [i.key, i]));
    const toApply = [...new Set(selectedKeys)].map((key) => byKey.get(key)).filter((i): i is TzItem => !!i);
    const skipped = selectedKeys.filter((key) => !byKey.has(key));

    const result: TzProvResult = { requested: selectedKeys.length, skipped, applied: [], failed: [] };
    if (!toApply.length) return result;

    const tag = { clientId: actor?.slice(0, 64), module: 'tender-bot', action: 'tz-prov' };
    const errors: string[] = [];

    // 1) Номери з проведених заявок — процедурою Тараса
    const histKods = toApply.filter((i) => i.source === 'hist').map((i) => i.kod!);
    try {
      for (let i = 0; i < histKods.length; i += ADD_CHUNK) {
        // Рядок kod-ів через кому, без пробілів і коми в кінці — так його розбирає p_utils.CountStr
        const chunk = histKods.slice(i, i + ADD_CHUNK).join(',');
        await this.oracle.executePlsql(
          `BEGIN ${k.addProc}(:per, :kods); END;`,
          { per: Number(kodPer), kods: chunk },
          tag,
        );
      }
    } catch (e: any) {
      // Попередні пачки вже закомічені процедурою — нижче звіряємо, що реально внеслось
      errors.push(this.oracleMessage(e));
    }

    // 2) Нові номери з непроведених заявок — тими самими полями, що й AddAmToTP/AddPrToTP
    for (const item of toApply.filter((i) => i.source === 'new')) {
      try {
        await this.oracle.executePlsql(
          `BEGIN
             BEGIN
               INSERT INTO ictdat.urtp (dat, dernom, kod_ur, marka, tyag, novl)
               VALUES (TRUNC(SYSDATE), :d, :per, SUBSTRB(:m, 1, 50), :tyag, 0);
             EXCEPTION
               -- Номер уже «власний» в іншого перевізника (UK на UKEY) — як у AddAmToTP: «не власність»
               WHEN DUP_VAL_ON_INDEX THEN
                 INSERT INTO ictdat.urtp (dat, dernom, kod_ur, marka, tyag, novl)
                 VALUES (TRUNC(SYSDATE), :d, :per, SUBSTRB(:m, 1, 50), :tyag, 1);
             END;
             COMMIT;
           END;`,
          { d: item.dernom, per: Number(kodPer), m: item.marka, tyag: k.tyag },
          tag,
        );
      } catch (e: any) {
        errors.push(`${item.dernom}: ${this.oracleMessage(e)}`);
      }
    }
    if (errors.length) result.error = errors.join('; ').slice(0, 500);

    // Що реально з'явилося в URTP (тригер нормалізує номер тим самим p_main.dernom)
    const rows = await this.oracle.executeReadOnlyQuery<any>(
      `SELECT dernom, NVL(novl, 0) novl
         FROM ictdat.urtp
        WHERE kod_ur = :per
          AND INSTR('|' || :d || '|', '|' || dernom || '|') > 0`,
      { per: Number(kodPer), d: toApply.map((i) => i.dernom).join('|') },
    );
    const inUrtp = new Map(rows.map((r) => [String(r.DERNOM), Number(r.NOVL) === 1]));
    for (const item of toApply) {
      if (inUrtp.has(item.dernom)) {
        result.applied.push({
          dernom: item.dernom,
          notOwned: inUrtp.get(item.dernom)!,
          source: item.source,
          zayNum: item.zayNum,
        });
      } else {
        result.failed.push(item.dernom);
      }
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
