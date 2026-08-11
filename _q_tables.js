require('dotenv').config();
const { Client } = require('pg');
const c = new Client({
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST, port: +process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
});
(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' AND (table_name ILIKE '%rate%' OR table_name ILIKE '%stavka%' OR table_name ILIKE '%bid%' OR table_name ILIKE '%offer%' OR table_name ILIKE '%tender%')
    ORDER BY table_name
  `);
  console.log(JSON.stringify(r.rows, null, 1));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
