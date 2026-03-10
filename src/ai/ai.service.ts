// src/ai/ai.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI, Part, Schema } from '@google/generative-ai';
import * as fs from 'fs';

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
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
        images?: Express.Multer.File[]
    ): Promise<T> {
        try {
            const imageParts: Part[] = images?.map((file) => {
                const base64Data = file.buffer
                    ? file.buffer.toString('base64')
                    : fs.readFileSync(file.path).toString('base64');

                return {
                    inlineData: {
                        data: base64Data,
                        mimeType: file.mimetype,
                    },
                };
            }) ?? [];

            const result = await this.model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                },
            });
    
            return JSON.parse(result.response.text()) as T;
        } catch (error) {
            console.error('Gemini API Error details:', error);
            throw error;
        }
    }
}