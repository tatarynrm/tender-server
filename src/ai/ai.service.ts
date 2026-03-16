// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI, Part, Schema } from '@google/generative-ai';
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
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
                    console.warn(`PDF parse check for ${file.originalname}:`, pdfError.message);
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