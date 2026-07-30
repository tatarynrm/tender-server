const { GoogleGenerativeAI } = require('@google/generative-ai');
const oracledb = require('oracledb');

// Load environment variables
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function run() {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONN_STRING,
    });

    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ICTDAT`);

    const rowsRes = await connection.execute(
      `SELECT table_name, comments FROM all_tab_comments WHERE owner = 'ICTDAT'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const oracleTables = rowsRes.rows.map((r) => {
      let comment = r.COMMENTS || undefined;
      if (r.TABLE_NAME === 'OS') {
        comment = 'Особовий склад, працівники, співробітники компанії, штат, персонал (NOS - ПІБ)';
      } else if (r.TABLE_NAME === 'DOG') {
        comment = 'Договори, контракти з клієнтами та перевізниками (NUMDOC - номер, DATDOC - дата)';
      } else if (r.TABLE_NAME === 'ZAY') {
        comment = 'Заявки на перевезення, замовлення, транспортні рейси, фрахти (VANTAZH, MARSH, AM, PR)';
      } else if (r.TABLE_NAME === 'PEREV') {
        comment = 'Перевізники, транспортні компанії, автопідприємства';
      }
      return {
        name: r.TABLE_NAME,
        comments: comment,
      };
    });

    console.log(`Loaded ${oracleTables.length} tables from DB`);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `You are an Oracle database administrator. Analyze the user request in Ukrainian and select the list of tables from the Oracle schema that are required to answer the query.

CRITICAL INSTRUCTION:
- Database table names are short cryptographic abbreviations (e.g. OS = "Особовий склад/працівники", BANKR = "Розхід банку", DOG = "Договори", ZAY = "Заявки на перевезення", PRET = "Претензії").
- ALWAYS read and prioritize the table comments/descriptions provided next to each table name in the list below to find the correct tables matching the user request. For example, "особовий склад/особи" matches "OS".
- Keep the selection minimal and highly focused (usually 1-3 tables).

CRITICAL MAPPING GUIDE (Map Ukrainian business terms to table names):
1. "Бухгалтерія", "фінанси", "оплати", "рахунки", "акти", "каса", "валюта" (Accounting, finance, payments, invoices, acts, currency):
   - BANKP (bank payments received / оплати від клієнтів)
   - BANKV (currency bank payments / валютні оплати)
   - ACTVR (client acceptance acts / акти виконаних робіт)
   - AVRMONCLIENT (monthly customer billing summaries)
   - RAHZAM (customer invoices / рахунки замовникам)
   - RAHPER (carrier invoices / рахунки перевізникам)
   - OPLKRED (credit payments / оплата кредитів)
   - VITR (expenses, payments, office costs / витрати)
   - VALUT (currencies / валюти)
   - VALUTCURS (exchange rates / курси валют)
2. "Договори", "угоди", "контракти" (Contracts, agreements):
   - DOG (contracts / договори)
   - DODUGODA (additional agreements / додаткові угоди)
3. "Заявки", "перевезення", "замовлення", "рейси", "водії", "авто", "маршрути" (Orders, requests, transport, drivers, trucks, routes):
   - ZAY (transport orders / заявки на перевезення)
   - ZAP (requests / запити)
   - PEREV (carriers directory / перевізники)
4. "Претензії", "штрафи" (Claims, disputes, fines):
   - PRET (claims / претензії)
5. "Співробітники", "штат", "кадри", "особовий склад", "менеджери","працівники", (Employees, staff, managers):
   - OS (our employees / особи / особистий склад / працівники)
   - STAFF (staff directory / штат)
6. "Борги", "заборгованість", "сальдо" (Debts, balance):
   - CABPER_STAT_BORG (carrier debts / борги перевізників)
   - BANKRRSAL (bank accounts balance / залишок розрахункових рахунків)
   - KASARRSAL (cash desks balance / залишок кас)
7. "Департаменти", "відділи" (Departments):
   - DEP (departments / відділи)

Return ONLY a JSON array of table names, e.g., ["BANKP", "RAHZAM"]. Do not include any formatting, markdown, or other text outside the JSON array.`,
    });

    const tablesText = oracleTables
      .map((t) => `${t.name}${t.comments ? ` - ${t.comments}` : ''}`)
      .join('\n');

    const prompt = `дай мені список працівників нашої компанії`;

    const promptText = `
User request: "${prompt}"

Available Oracle tables list:
${tablesText}

Select the exact table names from the list above that are necessary to construct the read-only SELECT query to answer the user request.
`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });
    console.log('Gemini raw output with full DB list:', result.response.text());

  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

run();
