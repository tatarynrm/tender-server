require('dotenv').config();
const { Client } = require('pg');

const c = new Client({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: +process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
});

(async () => {
  try {
    await c.connect();
    
    const tables = ['tender', 'tender_lst', 'tender_rate', 'tender_winner', 'person', 'person_telegram', 'person_role', 'usr', 'company', 'crm_load'];
    
    for (const table of tables) {
      console.log(`\n=== TABLE: ${table} ===`);
      
      const check = await c.query(`
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      `, [table]);
      
      if (check.rows.length === 0) {
        console.log('NOT EXISTS');
        continue;
      }
      // Колонки
      const cols = await c.query(`
        SELECT column_name, data_type, is_nullable, 
               (SELECT pg_catalog.col_description(t.oid, a.attnum) 
                FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace ns ON ns.oid = t.relnamespace
                JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid 
                WHERE t.relname = c.table_name AND ns.nspname = 'public' AND a.attname = c.column_name) AS comment
        FROM information_schema.columns c
        WHERE table_schema = 'public' AND table_name = $1 
        ORDER BY c.ordinal_position
      `, [table]);
      
      console.log('COLUMNS:');
      cols.rows.forEach(r => {
        const comment = r.comment ? ` (${r.comment})` : '';
        console.log(`  ${r.column_name}: ${r.data_type} ${r.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}${comment}`);
      });
      
      // FK
      const fks = await c.query(`
        SELECT 
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = $1
      `, [table]);
      
      if (fks.rows.length > 0) {
        console.log('FOREIGN KEYS:');
        fks.rows.forEach(fk => {
          console.log(`  ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
        });
      }
    }
    
    // 2. Статуси
    console.log('\n=== STATUS COLUMNS ===');
    const statusCols = await c.query(`
      SELECT table_name, column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name IN ('tender','tender_lst','tender_rate','tender_winner') 
      AND (column_name LIKE '%status%' OR column_name LIKE '%state%')
    `);
    
    for (const col of statusCols.rows) {
      const vals = await c.query(`
        SELECT DISTINCT ${col.column_name}::text FROM ${col.table_name} 
        WHERE ${col.column_name} IS NOT NULL
        ORDER BY ${col.column_name}::text LIMIT 20
      `);
      const valList = vals.rows.map(r => r[col.column_name]).join(', ');
      console.log(`${col.table_name}.${col.column_name}: ${valList}`);
    }
    
    // 3. Приклади
    console.log('\n=== TENDER SAMPLE (LIMIT 1) ===');
    const tenderSample = await c.query('SELECT * FROM tender LIMIT 1');
    if (tenderSample.rows.length > 0) {
      console.log(JSON.stringify(tenderSample.rows[0], null, 2));
    }
    
    console.log('\n=== TENDER_RATE SAMPLE (LIMIT 1) ===');
    const rateSample = await c.query('SELECT * FROM tender_rate LIMIT 1');
    if (rateSample.rows.length > 0) {
      console.log(JSON.stringify(rateSample.rows[0], null, 2));
    }
    
    console.log('\n=== TENDER_LST SAMPLE (LIMIT 1) ===');
    const lstSample = await c.query('SELECT * FROM tender_lst LIMIT 1');
    if (lstSample.rows.length > 0) {
      console.log(JSON.stringify(lstSample.rows[0], null, 2));
    }
    
    await c.end();
  } catch (e) {
    console.error('ERROR:', e.message, e.stack);
    process.exit(1);
  }
})();
