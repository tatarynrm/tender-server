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
   * Generates a PostgreSQL SELECT query based on the user's question (text and/or audio voice).
   */
  async generateDbQuery(
    prompt: string,
    voiceFile?: { buffer: Buffer; mimetype: string },
  ): Promise<{ type: 'sql' | 'conversational'; sql?: string; reply?: string }> {
    const schemaDefinition = `
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

Task: Write a read-only PostgreSQL SELECT query to get the information requested by the user. If the user request is just a greeting or general message, set type to "conversational" and return a friendly reply.
Do NOT write mutating queries (INSERT, UPDATE, DELETE, etc.). Only SELECT.
Return JSON matching this schema:
{
  "type": "sql" | "conversational",
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
        sql: {
          type: SchemaType.STRING,
          description: 'A valid, clean PostgreSQL read-only SELECT query answering the request. Limit output rows to 50 using LIMIT in the query.',
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
   * Formats the PostgreSQL query results into a beautiful, concise Ukrainian response.
   */
  async formatAnswer(question: string, data: any[]): Promise<string> {
    const aiModel = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: 'You are a professional coordinator and director assistant. Format the database query results into a clean, detailed, and comprehensive Ukrainian business response. CRITICAL RULE: Do NOT mention any technical database terminology, table names (e.g., company, person, tender), column/field names (e.g., conducted_tenders, total_tenders, id, count), JSON keys, or programming concepts. The audience is non-technical business executives (like the Director). Translate all variables into natural human-friendly business Ukrainian. Do not use Markdown tables (using pipes |). Instead, present structured data using bold headers, bullet lists, or clean monospaced text blocks (```...```) to align records. Keep the tone professional and polite.',
    });

    const prompt = `
User asked: "${question}"
Database query results:
${JSON.stringify(data, null, 2)}

Provide a detailed, professional, and comprehensive response in Ukrainian. Translate all technical column names and raw numbers into natural business explanations (e.g., instead of listing 'conducted_tenders: 0' write 'немає проведених тендерів', instead of listing 'total_tenders: 51' write 'загальна кількість тендерів у системі: 51'). Keep it extremely simple, professional, and easy to read for a company director.
`;

    try {
      const result = await aiModel.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Format answer error:', error);
      return `Отримано дані: \n${JSON.stringify(data, null, 2)}`;
    }
  }
}

