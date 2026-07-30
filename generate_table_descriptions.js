const { GoogleGenerativeAI } = require('@google/generative-ai');
const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONN_STRING,
    });
    
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ICTDAT`);
    
    // 1. Get all tables and their DB comments
    console.log('Fetching all tables...');
    const tablesRes = await connection.execute(
      `SELECT table_name, comments FROM all_tab_comments WHERE owner = 'ICTDAT'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const dbTables = tablesRes.rows;
    console.log(`Found ${dbTables.length} tables in DB.`);

    // 2. Get all columns and comments to enrich the prompt
    console.log('Fetching all column structures...');
    const columnsRes = await connection.execute(
      `SELECT c.table_name, c.column_name, c.data_type, com.comments
       FROM all_tab_columns c
       LEFT JOIN all_col_comments com 
         ON c.owner = com.owner 
         AND c.table_name = com.table_name 
         AND c.column_name = com.column_name
       WHERE c.owner = 'ICTDAT'
       ORDER BY c.table_name, c.column_id`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    
    const columnsMap = {};
    for (const row of columnsRes.rows) {
      if (!row.TABLE_NAME) continue;
      if (!columnsMap[row.TABLE_NAME]) {
        columnsMap[row.TABLE_NAME] = [];
      }
      columnsMap[row.TABLE_NAME].push(
        `${row.COLUMN_NAME} (${row.DATA_TYPE})${row.COMMENTS ? ` - ${row.COMMENTS}` : ''}`
      );
    }
    console.log('Columns fetched and grouped.');

    // 3. Prepare table metadata array
    const tablesMetadata = dbTables.map(t => ({
      name: t.TABLE_NAME,
      dbComment: t.COMMENTS || '',
      columns: (columnsMap[t.TABLE_NAME] || []).slice(0, 15) // Limit columns to save prompt space
    }));

    // Load existing comments if any
    const outputPath = path.join(__dirname, 'oracle_enriched_comments.json');
    let enrichedComments = {};
    if (fs.existsSync(outputPath)) {
      try {
        enrichedComments = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        console.log(`Loaded ${Object.keys(enrichedComments).length} existing comments from file.`);
      } catch (e) {
        // ignore
      }
    }

    // 4. Batch process with Gemini to write detailed Ukrainian descriptions
    const batchSize = 35;
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: 'You are an Oracle database analyst. Analyze the provided tables (names, columns, and existing comments) and write a clear, descriptive comment in Ukrainian explaining what data this table stores and how it relates to business. Return ONLY a JSON object mapping table names to their detailed Ukrainian descriptions. Do not include markdown formatting or other text.',
    });

    console.log(`Processing tables in batches of ${batchSize}...`);
    for (let i = 0; i < tablesMetadata.length; i += batchSize) {
      const batch = tablesMetadata.slice(i, i + batchSize);
      
      // Filter out tables that already have enriched comments to skip redundant API calls
      const batchToProcess = batch.filter(t => !enrichedComments[t.name]);
      if (batchToProcess.length === 0) {
        console.log(`Batch ${Math.floor(i / batchSize) + 1} already processed. Skipping.`);
        continue;
      }

      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tablesMetadata.length / batchSize)} (${batchToProcess.length} tables)...`);
      
      const promptText = `
Analyze the following tables and their column definitions. Write a detailed description for each table in Ukrainian.

${batchToProcess.map(t => `Table: ${t.name}\nDB Comment: ${t.dbComment}\nColumns:\n  ${t.columns.join('\n  ')}`).join('\n\n')}

Return a JSON object:
{
  "TABLE_NAME": "Detailed description in Ukrainian...",
  ...
}
`;

      try {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: 'application/json',
          }
        });
        
        const rawText = result.response.text().trim();
        const cleanJson = rawText
          .replace(/^```json\n?/, '')
          .replace(/```$/, '')
          .trim();
          
        const batchComments = JSON.parse(cleanJson);
        Object.assign(enrichedComments, batchComments);
        
        // Save progressively
        fs.writeFileSync(outputPath, JSON.stringify(enrichedComments, null, 2), 'utf8');
        console.log(`Saved batch progress to ${outputPath}. Total tables documented: ${Object.keys(enrichedComments).length}`);
      } catch (err) {
        console.error(`Failed to process batch starting at index ${i}:`, err);
      }

      // Sleep 4 seconds to avoid rate limits
      await sleep(4000);
    }

    console.log(`All descriptions generated and saved successfully!`);

  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

run();
