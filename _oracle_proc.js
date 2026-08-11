require('dotenv').config();
const oracledb = require('oracledb');

(async () => {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONN_STRING
    });

    // Test p_tender.GetCompany with migrate_id from Postgres
    const migrateIds = ['19061', '363751', '136211'];
    
    for (const id of migrateIds) {
      console.log(`\n=== GetCompany(${id}) ===`);
      try {
        const result = await conn.execute(
          `BEGIN :ret := p_tender.GetCompany(:id); END;`,
          {
            id: id,
            ret: {
              dir: oracledb.BIND_OUT,
              type: oracledb.STRING,
              maxSize: 1000000,
            },
          }
        );
        const jsonStr = result.outBinds.ret;
        if (jsonStr) {
          const data = JSON.parse(jsonStr);
          console.log(JSON.stringify(data, null, 1));
        } else {
          console.log('Procedure returned null/empty');
        }
      } catch (procErr) {
        console.log('Procedure error:', procErr.message);
      }
    }

  } catch (err) {
    console.error('Connection error:', err.message);
  } finally {
    if (conn) {
      await conn.close();
    }
  }
})();
