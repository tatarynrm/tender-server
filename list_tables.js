const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  user: 'user_dev',
  host: '192.168.1.211',
  database: 'db_dev',
  password: 'icttodb2',
  port: 5432,
});

async function main() {
  await client.connect();
  
  let output = "";
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tables = res.rows.map(r => r.table_name);

    for (const table of tables) {
      const colRes = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      output += `Table: ${table}\n`;
      output += colRes.rows.map(c => `  ${c.column_name} (${c.data_type}${c.is_nullable === 'YES' ? '?' : ''})`).join('\n') + '\n\n';
    }
    
    const outputPath = path.join(__dirname, '..', 'scratch', 'db_schema.txt');
    fs.writeFileSync(outputPath, output, 'utf8');
    console.log("Written schema to", outputPath);
  } catch(e) {
    console.error(e.message);
  }
  
  await client.end();
}

main();
