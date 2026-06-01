const { Client } = require('pg');

const client = new Client({
  user: 'user_dev',
  password: 'icttodb2',
  host: '192.168.1.211',
  port: 5432,
  database: 'db_dev',
});

async function run() {
  try {
    await client.connect();
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'usr_activities';
    `);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
