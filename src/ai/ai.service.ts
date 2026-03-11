// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI, Part, Schema } from '@google/generative-ai';
import * as fs from 'fs';
import sharp from 'sharp';
import pdf from 'pdf-parse';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(private configService: ConfigService) {
        const apiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim();
        if (!apiKey) {
            console.error('GEMINI_API_KEY is missing in configuration!');
        } else {
            console.log('Gemini AI initialized with key length:', apiKey.length);
        }
        this.genAI = new GoogleGenerativeAI(apiKey || '');
        // Використовуємо 1.5-flash, бо у 2.0-flash ліміти на безкоштовному тарифі жорсткіші
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    }

    private async preprocessFile(file: Express.Multer.File): Promise<Part> {
        try {
            const buffer = file.buffer || fs.readFileSync(file.path);

            // Оптимізація зображень: зменшуємо роздільну здатність для економії токенів
            if (file.mimetype.startsWith('image/')) {
                const optimizedBuffer = await sharp(buffer)
                    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 80 })
                    .toBuffer();

                console.log(`Image optimized: ${file.originalname} (${(buffer.length / 1024).toFixed(1)}KB -> ${(optimizedBuffer.length / 1024).toFixed(1)}KB)`);

                return {
                    inlineData: {
                        data: optimizedBuffer.toString('base64'),
                        mimeType: 'image/jpeg',
                    },
                };
            }

            // Для PDF можна було б витягувати текст, але Gemini сам добре працює з PDF.
            // Проте великі PDF споживають багато токенів (кожна сторінка = як фото).
            // Якщо PDF текстовий, можна було б передавати лише текст, щоб зекономити в 100 разів.
            if (file.mimetype === 'application/pdf') {
                try {
                    // pdf-parse can be tricky with imports, using await pdf(buffer)
                    // @ts-ignore
                    const pdfData = await pdf(buffer);
                    if (pdfData.text && pdfData.text.trim().length > 100) {
                        console.log(`PDF text extracted (${pdfData.text.length} chars) from ${file.originalname}`);
                    }
                } catch (pdfError) {
                    console.warn(`Could not parse PDF text for ${file.originalname}, sending as-is`, pdfError);
                }
            }

            return {
                inlineData: {
                    data: buffer.toString('base64'),
                    mimeType: file.mimetype,
                },
            };
        } catch (error) {
            console.error(`Error preprocessing file ${file.originalname}:`, error);
            // У разі помилки повертаємо як є
            const buffer = file.buffer || fs.readFileSync(file.path);
            return {
                inlineData: {
                    data: buffer.toString('base64'),
                    mimeType: file.mimetype,
                },
            };
        }
    }

    async listModels() {
        try {
            // @ts-ignore
            const result = await this.genAI.listModels();
            return result.models.map(m => m.name);
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
        files?: Express.Multer.File[]
    ): Promise<T> {
        try {
            const fileParts: Part[] = files
                ? await Promise.all(files.map(file => this.preprocessFile(file)))
                : [];

            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }, ...fileParts] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.1,
                },
            });

            return JSON.parse(result.response.text()) as T;
        } catch (error) {
            console.error('Gemini API Error details:', error);
            throw error;
        }
    }
}