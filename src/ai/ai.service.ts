// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI, Part, Schema, SchemaType } from '@google/generative-ai';
import { POSTGRES_SCHEMA, ORACLE_SCHEMA } from './ai.constants';
import * as fs from 'fs';
import * as pdf from 'pdf-parse';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim();
    if (!apiKey) {
      console.error('GEMINI_API_KEY is missing in configuration!');
    }
    this.genAI = new GoogleGenerativeAI(apiKey || '');
    // gemini-2.0-flash - найсучасніша і стабільна безкоштовна модель
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      systemInstruction:
        'Ти експерт-логіст. Твоє завдання - аналізувати вхідні дані (текст, фото документів, аудіо) та витягувати структуровану інформацію про вантажі. Відповідай ТІЛЬКИ у форматі JSON згідно з наданою схемою. Не додавай жодних пояснень поза JSON.',
    });
  }

  private async preprocessFile(file: Express.Multer.File): Promise<Part> {
    try {
      const buffer = file.buffer;

      if (!buffer) {
        throw new Error(`Buffer is missing for file: ${file.originalname}`);
      }

      // PDF text extraction (optional) check
      if (file.mimetype === 'application/pdf') {
        try {
          // @ts-ignore
          await (pdf as any)(buffer);
        } catch (pdfError) {
          console.warn(
            `PDF parse check for ${file.originalname}:`,
            pdfError.message,
          );
        }
      }

      return {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: file.mimetype,
        },
      };
    } catch (error) {
      console.error(
        `Critical error preprocessing file ${file.originalname}:`,
        error.message,
      );

      if (file.buffer) {
        return {
          inlineData: {
            data: file.buffer.toString('base64'),
            mimeType: file.mimetype,
          },
        };
      }
      throw error;
    }
  }

  async listModels() {
    try {
      // @ts-ignore
      const result = await this.genAI.listModels();
      return result.models.map((m) => m.name);
    } catch (error) {
      console.error('List models error:', error);
      throw error;
    }
  }

  /**
   * Універсальний метод для отримання типізованого JSON з тексту та/або фото
   */
  async extractDataAsJson<T>(
    prompt: string,
    schema: Schema,
    files?: Express.Multer.File[],
  ): Promise<T> {
    try {
      const fileParts: Part[] = files
        ? await Promise.all(files.map((file) => this.preprocessFile(file)))
        : [];

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }, ...fileParts] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.1,
        },
      });

      const text = result.response.text();
      // Покращене очищення JSON для різних моделей
      const cleanJson = text
        .replace(/^```json\n?/, '')
        .replace(/```$/, '')
        .trim();

      try {
        return JSON.parse(cleanJson) as T;
      } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', text);
        // Спробуємо витягти JSON якщо він десь всередині тексту
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]) as T;
          } catch (innerError) {
            throw new Error('AI повернув некоректний формат JSON');
          }
        }
        throw new Error('AI повернув некоректний формат JSON');
      }
    } catch (error) {
      console.error('Gemini API Error details:', error);
      throw error;
    }
  }


  /**
   * Класифікує пачку листів: коротка суть українською + рівень важливості.
   * Один запит на всі листи заради швидкості й економії токенів.
   */
  async classifyEmails(
    emails: { from: string; subject: string; body: string }[],
  ): Promise<
    { index: number; essence: string; importance: 'high' | 'medium' | 'low'; category: string }[]
  > {
    if (!emails.length) return [];

    const aiModel = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `Ти — асистент керівника логістично-тендерної компанії ICT. Тобі дають список непрочитаних листів.
Для КОЖНОГО листа:
1. "essence" — стисло опиши суть листа ОДНИМ реченням українською (максимум 15 слів, по ділу, без вступів).
2. "importance" — оціни важливість: "high" (термінове/гроші/договори/претензії/дедлайни/особисте звернення від клієнта чи керівництва), "medium" (робоче листування, тендери, звичайні запити), "low" (розсилки, реклама, автоматичні сповіщення, спам, соцмережі).
3. "category" — коротка категорія 1-2 слова українською (напр. "Тендер", "Договір", "Претензія", "Розсилка", "Рахунок", "Особисте").
Поверни РІВНО стільки елементів, скільки листів, зберігаючи їхній порядок через поле "index".`,
    });

    const emailsText = emails
      .map(
        (e, i) =>
          `#${i}\nВід: ${e.from}\nТема: ${e.subject}\nТекст: ${(e.body || '').slice(0, 1200)}`,
      )
      .join('\n---\n');

    try {
      const result = await aiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: emailsText }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              results: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    index: { type: SchemaType.INTEGER },
                    essence: { type: SchemaType.STRING },
                    importance: {
                      type: SchemaType.STRING,
                      format: 'enum',
                      enum: ['high', 'medium', 'low'],
                    },
                    category: { type: SchemaType.STRING },
                  },
                  required: ['index', 'essence', 'importance', 'category'],
                },
              },
            },
            required: ['results'],
          } as Schema,
        },
      });

      const rawText = result.response.text();
      const cleanJson = rawText
        .trim()
        .replace(/^```json\n?/, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(cleanJson) as {
        results: {
          index: number;
          essence: string;
          importance: 'high' | 'medium' | 'low';
          category: string;
        }[];
      };
      return parsed.results || [];
    } catch (err) {
      console.error('classifyEmails failed:', err);
      return [];
    }
  }

  /**
   * Identifies which Oracle database tables are relevant to the user query out of all 400+ tables.
   */
  async findOracleTables(prompt: string, tablesList: { name: string; comments?: string }[]): Promise<string[]> {
    const aiModel = this.genAI.getGenerativeModel({
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
5. "Співробітники", "штат", "кадри", "особовий склад", "менеджери" (Employees, staff, managers):
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


    const tablesText = tablesList
      .map((t) => `${t.name}${t.comments ? ` - ${t.comments}` : ''}`)
      .join('\n');
    const promptText = `
User request: "${prompt}"

Available Oracle tables list:
${tablesText}

Select the exact table names from the list above that are necessary to construct the read-only SELECT query to answer the user request.
`;

    try {
      const result = await aiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.STRING,
            },
          },
        },
      });
      const rawText = result.response.text();
      const cleanJson = rawText.trim()
        .replace(/^```json\n?/, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(cleanJson) as string[];
      return parsed;
    } catch (err) {
      console.error('Failed to classify Oracle tables:', err);
      return [];
    }
  }

  /**
   * Identifies which PostgreSQL database tables are relevant to the user query.
   */
  async findPostgresTables(prompt: string, tablesList: { name: string; comments?: string }[]): Promise<string[]> {
    const aiModel = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: 'You are a PostgreSQL database administrator. Analyze the user request in Ukrainian and select the list of tables from the database schema that are required to answer the query. Return ONLY a JSON array of table names, e.g., ["tender", "company"]. Do not include any formatting, markdown, or other text outside the JSON array. Keep the selection minimal and highly focused (usually 1-3 tables).',
    });

    const tablesText = tablesList
      .map((t) => `${t.name}${t.comments ? ` - ${t.comments}` : ''}`)
      .join('\n');
    const promptText = `
User request: "${prompt}"

Available PostgreSQL tables list:
${tablesText}

Select the exact table names from the list above that are necessary to construct the read-only SELECT query to answer the user request.
`;

    try {
      const result = await aiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.STRING,
            },
          },
        },
      });
      const rawText = result.response.text();
      const cleanJson = rawText.trim()
        .replace(/^```json\n?/, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(cleanJson) as string[];
      return parsed;
    } catch (err) {
      console.error('Failed to classify PostgreSQL tables:', err);
      return [];
    }
  }

  /**
   * Transcribes a voice message buffer into Ukrainian text using Gemini.
   */
  async transcribeVoice(voiceFile: { buffer: Buffer; mimetype: string }): Promise<string> {
    const aiModel = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: 'You are a professional transcription assistant. Transcribe the audio file precisely. Return ONLY the transcribed text in Ukrainian. Do not add any introduction, notes, or extra text.',
    });

    try {
      const filePart = {
        inlineData: {
          data: voiceFile.buffer.toString('base64'),
          mimeType: voiceFile.mimetype,
        },
      };

      const result = await aiModel.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Розпізнай аудіо.' },
              filePart
            ]
          }
        ],
      });

      return result.response.text().trim();
    } catch (err) {
      console.error('Failed to transcribe voice:', err);
      return '';
    }
  }

  /**
   * Generates a PostgreSQL or Oracle SELECT query based on the user's question (text and/or audio voice).
   */
  async generateDbQuery(
    prompt: string,
    voiceFile?: { buffer: Buffer; mimetype: string },
    targetDb?: 'postgres' | 'oracle',
    customSchema?: string,
  ): Promise<{ type: 'sql' | 'conversational'; database?: 'postgres' | 'oracle'; sql?: string; reply?: string }> {
    let schemaDefinition = '';
    
    if (targetDb === 'oracle') {
      schemaDefinition = `
You must write a read-only Oracle SELECT query to answer the user request.
CRITICAL INSTRUCTION:
- Database table names and column names are short cryptographic abbreviations.
- Read and pay attention to the comments provided next to the table name and columns (e.g. column_name - comment) to understand which fields contain the required data.
- E.g. Table OS has columns representing employee full name, Table BANKR is bank expenses, DOG is contracts.
- Always write SQL dialect compatible with Oracle Database. Limit output rows to 50 using ROWNUM <= 50 (do not use PostgreSQL's LIMIT clause).

${customSchema || ORACLE_SCHEMA}

Task: Write a clean, read-only SELECT query for Oracle database to get the requested information. If the user request is just a greeting or general message, set type to "conversational" and return a friendly reply.
Do NOT write mutating queries (INSERT, UPDATE, DELETE, etc.). Only SELECT.
Return JSON matching this schema:
{
  "type": "sql" | "conversational",
  "database": "oracle",
  "sql": "SELECT ...",
  "reply": "Friendly response if conversational"
}
`;
    } else if (targetDb === 'postgres') {
      schemaDefinition = `
You must write a read-only PostgreSQL SELECT query to answer the user request.
CRITICAL: Always write SQL dialect compatible with PostgreSQL. Limit output rows to 50 using LIMIT 50.

${POSTGRES_SCHEMA}

Task: Write a clean, read-only SELECT query for PostgreSQL database to get the requested information. If the user request is just a greeting or general message, set type to "conversational" and return a friendly reply.
Do NOT write mutating queries (INSERT, UPDATE, DELETE, etc.). Only SELECT.
Return JSON matching this schema:
{
  "type": "sql" | "conversational",
  "database": "postgres",
  "sql": "SELECT ...",
  "reply": "Friendly response if conversational"
}
`;
    } else {
      schemaDefinition = `
You have access to two databases:
1. PostgreSQL (database: "postgres") - stores tender portal active data.
2. Oracle (database: "oracle") - stores ERP, contracts, carrier accounts, billing, expenses, employee directories.

${POSTGRES_SCHEMA}

${ORACLE_SCHEMA}

Task: Determine which database is required (postgres or oracle). Write a clean, read-only SELECT query for that database to get the requested information.
If the query is for Oracle:
- Always write SQL dialect compatible with Oracle Database (e.g. use ROWNUM <= 50 to limit rows, do not use LIMIT clause!).
If the query is for PostgreSQL:
- Write standard PostgreSQL dialect (use LIMIT 50 to limit rows).

If the user request is conversational or doesn't require database info, set type to "conversational" and return a friendly reply.
Do NOT write mutating queries (INSERT, UPDATE, DELETE, etc.). Only SELECT.
Return JSON matching this schema:
{
  "type": "sql" | "conversational",
  "database": "postgres" | "oracle",
  "sql": "SELECT ...",
  "reply": "Friendly response if conversational"
}
`;
    }

    const responseSchema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        type: {
          type: SchemaType.STRING,
          enum: ['sql', 'conversational'],
          format: 'enum',
          description: 'Whether a SQL query is needed or it is a simple conversational message',
        },
        database: {
          type: SchemaType.STRING,
          enum: ['postgres', 'oracle'],
          format: 'enum',
          description: 'The target database to run the query against',
        },
        sql: {
          type: SchemaType.STRING,
          description: 'A valid, clean read-only SELECT query answering the request. Limit output rows to 50 (use LIMIT 50 for postgres, or ROWNUM <= 50 for oracle).',
        },
        reply: {
          type: SchemaType.STRING,
          description: 'A direct reply if no SQL is generated',
        },
      },
      required: ['type'],
    };


    let files: Express.Multer.File[] = [];
    if (voiceFile) {
      files.push({
        buffer: voiceFile.buffer,
        mimetype: voiceFile.mimetype,
        originalname: 'voice.ogg',
        fieldname: 'voice',
        encoding: '7bit',
        size: voiceFile.buffer.length,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      });
    }

    const aiModel = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: 'You are an advanced database AI assistant. Your job is to translate natural language questions (text or voice audio) into correct, read-only PostgreSQL SELECT queries. Return ONLY the requested JSON format.',
    });

    const userPrompt = `${schemaDefinition}\n\nUser Question: ${prompt || 'Analyze the attached voice message'}`;

    try {
      const fileParts: Part[] = await Promise.all(
        files.map((file) => this.preprocessFile(file)),
      );

      const result = await aiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }, ...fileParts] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.1,
        },
      });

      const text = result.response.text();
      const cleanJson = text
        .replace(/^```json\n?/, '')
        .replace(/```$/, '')
        .trim();

      return JSON.parse(cleanJson);
    } catch (error) {
      console.error('Failed to generate DB query:', error);
      return {
        type: 'conversational',
        reply: 'Вибачте, виникла помилка при обробці вашого запиту штучним інтелектом.',
      };
    }
  }

  /**
   * Formats the PostgreSQL or Oracle query results into a beautiful Ukrainian response.
   */
  async formatAnswer(question: string, data: any[], userFullName?: string): Promise<string> {
    const aiModel = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: 'You are a professional coordinator and assistant named "ІСТ помічник" (do NOT refer to yourself as "ваш асистент"). Format the database query results into a clean, detailed, and comprehensive Ukrainian business response. CRITICAL RULES: 1. Do NOT mention any technical database terminology, table names (e.g., company, person, tender, ZAY, DOG), column/field names (e.g., conducted_tenders, total_tenders, id, count), JSON keys, or programming concepts. Translate all variables into natural human-friendly business Ukrainian. 2. Start the message by greeting the user strictly by their full name (Surname Name Patronymic) which is provided in the prompt. Do NOT use templates like "Шановний Директоре" or "Директор". 3. Do not use Markdown tables (using pipes |). Instead, present structured data using bold headers, bullet lists, or clean monospaced text blocks (```...```) to align records. Keep the tone professional, polite, and respectful.',
    });

    const prompt = `
User asked: "${question}"
User's Full Name (Surname Name Patronymic): "${userFullName || 'Користувач'}"
Database query results:
${JSON.stringify(data, null, 2)}

Provide a detailed, professional, and comprehensive response in Ukrainian. 
Greet the user strictly by their full name (Surname Name Patronymic) at the very beginning of the response (e.g., "Вітаю, [Прізвище] [Ім'я] [По батькові]!"). Do NOT write "Шановний Директоре" or similar placeholders.
Introduce yourself as "ІСТ помічник" (e.g. "Я Ваш ІСТ помічник...").
Translate all technical column names and raw numbers into natural business explanations (e.g., instead of listing 'conducted_tenders: 0' write 'немає проведених тендерів', instead of listing 'total_tenders: 51' write 'загальна кількість тендерів у системі: 51'). Keep it extremely simple, professional, and easy to read.
`;

    try {
      const result = await aiModel.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Format answer error:', error);
      return `Вітаю! Отримано дані:\n${JSON.stringify(data, null, 2)}`;
    }
  }
}


