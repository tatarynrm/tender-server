const oracledb = require('oracledb');

async function main() {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: 'expert',
      password: 'icttodb',
      connectString: '(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=192.168.1.207)(PORT=1521))(CONNECT_DATA=(SERVER=DEDICATED)(SERVICE_NAME=ict)))'
    });
    
    console.log('Connected to Oracle');
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ICTDAT`);
    
    // Get all tables
    const res = await connection.execute(`
      SELECT table_name 
      FROM all_tables 
      WHERE owner = 'ICTDAT'
      ORDER BY table_name
    `);
    
    const tables = res.rows.map(r => r[0]);
    console.log('Tables:', JSON.stringify(tables, null, 2));

    const fs = require('fs');
    const path = require('path');
    let output = '';

    for (const table of tables) {
      const colRes = await connection.execute(`
        SELECT column_name, data_type, nullable 
        FROM all_tab_columns 
        WHERE owner = 'ICTDAT' AND table_name = :tbl
        ORDER BY column_id
      `, { tbl: table });
      
      output += `Table: ${table}\n`;
      output += colRes.rows.map(r => `  ${r[0]} (${r[1]}${r[2] === 'Y' ? '?' : ''})`).join('\n') + '\n\n';
    }
    
    const outPath = path.join(__dirname, '..', 'scratch', 'oracle_schema.txt');
    fs.writeFileSync(outPath, output, 'utf8');
    console.log('Schema written to', outPath);
    
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
}

main();
