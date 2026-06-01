const { Client } = require('pg');

const client = new Client({
  user: 'user_dev',
  host: '192.168.1.211',
  database: 'db_dev',
  password: 'icttodb2',
  port: 5432,
});

async function main() {
  await client.connect();
  console.log("Connected to DB");
  
  try {
    const actRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'usr_activities';
    `);
    console.log("usr_activities columns:", actRes.rows);
  } catch(e) {
    console.error(e.message);
  }

  try {
    const mailRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'mailing_content';
    `);
    console.log("mailing_content columns:", mailRes.rows);
  } catch(e) {
    console.error(e.message);
  }
  
  await client.end();
}

main();
