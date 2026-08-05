import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  database: process.env.POSTGRES_DB,
});

const r = await pool.query(
  `select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tender_statistic'`,
);
console.log(r.rows[0]?.prosrc ?? '(немає процедури)');
await pool.end();
