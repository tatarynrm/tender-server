// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI, Part, Schema } from '@google/generative-ai';
import * as fs from 'fs';
import sharp from 'sharp';
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
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    }

    private async preprocessFile(file: Express.Multer.File): Promise<Part> {
        try {
            const buffer = file.buffer;

            if (!buffer) {
                throw new Error(`Buffer is missing for file: ${file.originalname}`);
            }

            // Оптимізація зображень
            if (file.mimetype.startsWith('image/')) {
                try {
                    const optimizedBuffer = await sharp(buffer)
                        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    return {
                        inlineData: {
                            data: optimizedBuffer.toString('base64'),
                            mimeType: 'image/jpeg',
                        },
                    };
                } catch (sharpError) {
                    console.warn(`Sharp optimization failed for ${file.originalname}, using original:`, sharpError.message);
                    // Якщо sharp зламався (наприклад, на Ubuntu), просто йдемо далі і шлемо оригінал
                }
            }

            // PDF text extraction (optional)
            if (file.mimetype === 'application/pdf') {
                try {
                    // @ts-ignore
                    const pdfData = await (pdf as any)(buffer);
                    // Тут можна було б додати логіку лише тексту, але поки шлемо файл
                } catch (pdfError) {
                    console.warn(`PDF parse log for ${file.originalname}:`, pdfError.message);
                }
            }

            return {
                inlineData: {
                    data: buffer.toString('base64'),
                    mimeType: file.mimetype,
                },
            };
        } catch (error) {
            console.error(`Critical error preprocessing file ${file.originalname}:`, error.message);

            // Якщо все пішло не так, але у нас є хоча б буфер
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

            const text = result.response.text();
            // Gemini іноді може повернути текст у блоку ```json ... ``` навіть при вказаному mimeType
            const cleanJson = text.replace(/^```json/, '').replace(/```$/, '').trim();

            try {
                return JSON.parse(cleanJson) as T;
            } catch (parseError) {
                console.error('Failed to parse AI response as JSON:', text);
                throw new Error('AI повернув некоректний формат JSON');
            }
        } catch (error) {
            console.error('Gemini API Error details:', error);
            throw error;
        }
    }
}