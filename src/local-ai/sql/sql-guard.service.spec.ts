import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchemaCatalogService } from '../schema/schema-catalog.service';
import { SqlGuardService } from './sql-guard.service';

/**
 * Тести на єдине правило, яке не можна зламати непомітно: модель може лише читати.
 *
 * Відколи SQL пише сама модель, цей валідатор — головний рубіж захисту, тому
 * набір заборон закріплений тестами, а не лише код-рев'ю.
 */
describe('SqlGuardService', () => {
  const MAX_ROWS = 200;

  const catalog = {
    getAllowedTables: () => ['tender', 'tender_lst', 'tender_rate', 'company'],
  } as unknown as SchemaCatalogService;

  const config = {
    get: () => undefined, // LOCAL_AI_ORACLE_ENABLED не заданий → Oracle вимкнено
  } as unknown as ConfigService;

  const guard = new SqlGuardService(catalog, config);

  const validate = (sql: string) => guard.validate(sql, 'postgres', MAX_ROWS);

  describe('дозволено лише читання', () => {
    it.each([
      ['DELETE FROM tender WHERE id = 1'],
      ['UPDATE tender SET price_start = 0'],
      ['INSERT INTO tender (cargo) VALUES (\'x\')'],
      ['DROP TABLE tender'],
      ['TRUNCATE TABLE tender'],
      ['ALTER TABLE tender ADD COLUMN x int'],
      ['CREATE TABLE hack (id int)'],
      ['GRANT ALL ON tender TO public'],
      ['MERGE INTO tender USING company ON true'],
    ])('відхиляє %s', (sql) => {
      expect(() => validate(sql)).toThrow(ForbiddenException);
    });

    it('відхиляє мутацію, дописану до SELECT', () => {
      expect(() =>
        validate('SELECT id FROM tender; DROP TABLE tender'),
      ).toThrow(ForbiddenException);
    });

    it('відхиляє мутацію, сховану в коментарі', () => {
      expect(() =>
        validate('SELECT id FROM tender -- WHERE false'),
      ).toThrow(ForbiddenException);
    });

    it('відхиляє блокування рядків', () => {
      expect(() => validate('SELECT id FROM tender FOR UPDATE')).toThrow(
        ForbiddenException,
      );
    });

    it('відхиляє SELECT ... INTO — це створення таблиці', () => {
      expect(() => validate('SELECT id INTO hack FROM tender')).toThrow(
        ForbiddenException,
      );
    });

    it('відхиляє долар-цитування (тіло анонімного блоку)', () => {
      expect(() =>
        validate('SELECT $$ DROP TABLE tender $$ FROM tender'),
      ).toThrow(ForbiddenException);
    });

    it('відхиляє незакритий рядковий літерал', () => {
      expect(() =>
        validate("SELECT id FROM tender WHERE cargo = 'зерно"),
      ).toThrow(ForbiddenException);
    });
  });

  /**
   * Відколи модель бачить усю схему, у запит легально потрапляють колонки,
   * що збігаються з назвами команд. Пословний блек-лист відхиляв би їх —
   * ці кейси фіксують, що перевірка дивиться на команду з продовженням.
   */
  describe('легальні запити, схожі на команди', () => {
    it('пропускає колонку comment', () => {
      const { sql } = validate('SELECT t.comment FROM tender t');
      expect(sql).toContain('t.comment');
    });

    it('пропускає функцію replace()', () => {
      const { sql } = validate(
        "SELECT REPLACE(t.cargo, 'а', 'о') AS cargo FROM tender t",
      );
      expect(sql).toContain('REPLACE');
    });

    it('пропускає українські псевдоніми колонок', () => {
      const { sql } = validate(
        'SELECT COUNT(t.id) AS "Кількість тендерів" FROM tender t',
      );
      expect(sql).toContain('"Кількість тендерів"');
    });

    it('пропускає псевдонім з апострофом — він не відкриває літерал', () => {
      const { sql } = validate(
        "SELECT c.company_name AS \"Ім'я компанії\" FROM company c WHERE c.is_carrier = TRUE",
      );
      expect(sql).toContain("Ім'я компанії");
    });

    it('пропускає пошук зі словом-командою всередині літерала', () => {
      const { sql } = validate(
        "SELECT id FROM tender WHERE cargo ILIKE '%delete from%'",
      );
      expect(sql).toContain('ILIKE');
    });
  });

  describe('межі доступу', () => {
    it('відхиляє таблицю поза каталогом', () => {
      expect(() => validate('SELECT * FROM usr')).toThrow(ForbiddenException);
    });

    it('відхиляє системні каталоги', () => {
      expect(() =>
        validate('SELECT table_name FROM information_schema.tables'),
      ).toThrow(ForbiddenException);
    });

    it('відхиляє службові об’єкти pg_*', () => {
      expect(() => validate('SELECT pg_sleep(10) FROM tender')).toThrow(
        ForbiddenException,
      );
    });

    it('відхиляє set_config — він переживає ROLLBACK і псує з’єднання в пулі', () => {
      expect(() =>
        validate("SELECT set_config('statement_timeout','0',false) FROM tender"),
      ).toThrow(ForbiddenException);
    });

    it('відхиляє приватні колонки, навіть якщо таблиця дозволена', () => {
      expect(() => validate('SELECT private_info FROM company')).toThrow(
        ForbiddenException,
      );
    });

    it('відхиляє Oracle, поки джерело вимкнено', () => {
      expect(() => guard.validate('SELECT KOD FROM ZAY', 'oracle', MAX_ROWS)).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('коректні запити', () => {
    it('пропускає SELECT по дозволених таблицях і додає LIMIT', () => {
      const { sql, tables } = validate(
        'SELECT t.id, c.company_name FROM tender t JOIN company c ON c.id = t.id_owner_company',
      );

      expect(sql).toContain(`LIMIT ${MAX_ROWS}`);
      expect(tables.sort()).toEqual(['company', 'tender']);
    });

    it('лишає власний LIMIT, якщо він у межах стелі', () => {
      const { sql } = validate('SELECT id FROM tender LIMIT 10');
      expect(sql).toBe('SELECT id FROM tender LIMIT 10');
    });

    it('зрізає LIMIT, більший за стелю', () => {
      const { sql } = validate('SELECT id FROM tender LIMIT 5000 OFFSET 20');
      expect(sql).toBe(`SELECT id FROM tender LIMIT ${MAX_ROWS} OFFSET 20`);
    });

    it('пропускає агрегати з ILIKE', () => {
      const { sql } = validate(
        "SELECT c.company_name, COUNT(r.id) AS stavok FROM tender_rate r JOIN company c ON c.id = r.id_company WHERE c.company_name ILIKE '%агро%' GROUP BY c.company_name",
      );
      expect(sql).toContain(`LIMIT ${MAX_ROWS}`);
    });
  });
});
