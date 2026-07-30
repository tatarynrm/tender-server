// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI, Part, Schema, SchemaType } from '@google/generative-ai';
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
   * Generates a PostgreSQL or Oracle SELECT query based on the user's question (text and/or audio voice).
   */
  async generateDbQuery(
    prompt: string,
    voiceFile?: { buffer: Buffer; mimetype: string },
  ): Promise<{ type: 'sql' | 'conversational'; database?: 'postgres' | 'oracle'; sql?: string; reply?: string }> {
    const schemaDefinition = `
You have access to two databases:
1. PostgreSQL (use database: "postgres") - stores tender portal active data.
2. Oracle (use database: "oracle") - stores ERP, contracts, carrier accounts, billing, expenses, employee directories.

Here is the PostgreSQL database schema:
1. Table: company
   - id (bigint) - primary key
   - company_name (character varying)
   - edrpou (character varying)
   - black_list (boolean)
   - is_blocked (boolean)
   - is_carrier (boolean)
   - is_client (boolean)
2. Table: person
   - id (bigint) - primary key
   - surname (character varying)
   - name (character varying)
   - email (character varying)
   - id_company (bigint) - references company(id)
   - position (character varying)
3. Table: person_role
   - id (bigint) - primary key
   - id_person (bigint) - references person(id)
   - is_admin (boolean)
   - is_ict (boolean)
   - is_manager (boolean)
4. Table: vehicle
   - id (bigint) - primary key
   - carnum (character varying) - vehicle plate number
   - id_company (bigint) - references company(id)
   - ids_trailer_type (character varying)
5. Table: tender
   - id (bigint) - primary key
   - cargo (character varying) - name of the goods/cargo
   - date_load (timestamp) - loading date
   - price_start (numeric) - starting price
   - weight (numeric)
   - volume (numeric)
   - id_owner_company (bigint) - references company(id)
6. Table: tender_lst (list of tenders with routes)
   - id (bigint) - primary key
   - id_tender (bigint) - references tender(id)
   - city_from (character varying) - source city
   - city_to (character varying) - destination city
   - ids_country_from (character varying)
   - ids_country_to (character varying)
   - ids_status (character varying) - tender status
   - car_count_all (integer)
7. Table: tender_rate (bids from carriers)
   - id (bigint) - primary key
   - id_tender (bigint) - references tender(id)
   - id_company (bigint) - references company(id)
   - price_proposed (numeric)
   - time_add (timestamp)
8. Table: tender_winner (tender winner)
   - id (bigint) - primary key
   - id_tender (bigint) - references tender(id)
   - id_company (bigint) - references company(id)
   - id_person (bigint) - references person(id)
9. Table: person_telegram (Telegram links)
   - id (bigint) - primary key
   - telegram_id (bigint)
   - username (character varying)
   - id_person (bigint) - references person(id)

Here is the Oracle database schema (under CURRENT_SCHEMA = ICTDAT):
1. Table: FIRMA (our internal firms / companies)
   - KOD (NUMBER) - primary key
   - NFIRMA (VARCHAR2) - firm/company name
2. Table: PEREV (carriers)
   - KOD (NUMBER) - primary key
   - NUMDOC (VARCHAR2)
   - DATDOC (DATE)
   - KOD_FIRMA (NUMBER)
3. Table: DOG (contracts)
   - KOD (NUMBER) - primary key
   - NUMDOC (VARCHAR2) - contract number
   - DATDOC (DATE) - contract date
   - ZMIST (VARCHAR2) - contract content
   - TERMIN (DATE) - contract end date
   - KOD_FIRMA (NUMBER) - references FIRMA(KOD)
4. Table: ZAY (orders / requests)
   - KOD (NUMBER) - primary key
   - NUMDOC (VARCHAR2) - order document number
   - DATDOC (DATE) - order document date
   - VANTAZH (VARCHAR2) - cargo description
   - VANTTON (NUMBER) - cargo weight in tons
   - VANTOBJEM (NUMBER) - cargo volume in m3
   - ZAMSUMA (NUMBER) - customer rate
   - PERSUMA (NUMBER) - carrier rate
   - KOD_ZAM (NUMBER) - customer ID (references customer/firm)
   - KOD_PER (NUMBER) - carrier ID (references PEREV)
   - DATZAV (DATE) - loading datetime
   - DATROZV (DATE) - unloading datetime
   - MARSH (VARCHAR2) - route summary
   - PUNKTZ (VARCHAR2) - loading town/point
   - PUNKTR (VARCHAR2) - unloading town/point
   - AM (VARCHAR2) - truck plate number
5. Table: PRET (claims)
   - KOD (NUMBER) - primary key
   - NUMDOC (VARCHAR2) - claim number
   - DATDOC (DATE) - claim date
   - SUMA (NUMBER) - claim sum
   - PRIM (VARCHAR2) - remarks/notes
6. Table: KONTAKT (contacts directory)
   - KOD (NUMBER) - primary key
   - NKONTAKT (VARCHAR2) - contact person name
   - TEL (VARCHAR2) - phone number
   - EMAIL (VARCHAR2) - email address
7. Table: OS (our internal employee directory)
   - KOD (NUMBER) - primary key
   - NOS (VARCHAR2) - employee full name

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


