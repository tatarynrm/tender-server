// src/logistics/logistics-parser.service.ts
import { Injectable } from '@nestjs/common';
import { SchemaType, Schema } from '@google/generative-ai'; // Додано Schema
import { AiService } from '../ai.service';

@Injectable()
export class LogisticsParserService {
    constructor(private readonly aiService: AiService) { }

    async parseCargo(text: string, images?: Express.Multer.File[]) {
        const prompt = `Витягни структуровані дані про вантаж з наданого тексту або зображень. 
        Повертай дані лише українською мовою. 
        Дати: YYYY-MM-DD. 
        Числа: лише цифри (без 'т', 'грн' тощо). 
        truckTypes: масив типів (Тент, Рефрижератор, Зерновоз, Самоскид, Контейнер, Трал, Платформа, Бус).
        isCollective: true якщо вантаж збірний (LTL), false якщо ціла машина (FTL).`;

        const schema: Schema = {
            type: SchemaType.OBJECT,
            properties: {
                origin: { type: SchemaType.STRING, description: 'Місто завантаження' },
                destination: { type: SchemaType.STRING, description: 'Місто розвантаження' },
                cargoName: { type: SchemaType.STRING, description: 'Назва товару (наприклад: пшениця, цегла, меблі)' },
                weight: { type: SchemaType.NUMBER, description: 'Вага тонн' },
                volume: { type: SchemaType.NUMBER, description: 'Об’єм м3' },
                price: { type: SchemaType.NUMBER, description: 'Бюджет' },
                currency: { type: SchemaType.STRING, description: 'Валюта (UAH, USD, EUR)' },
                truckCount: { type: SchemaType.NUMBER, description: 'Кількість авто' },
                truckTypes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'Типи авто' },
                dateLoad: { type: SchemaType.STRING, description: 'Дата завантаження' },
                dateUnload: { type: SchemaType.STRING, description: 'Дата розвантаження' },
                isCollective: { type: SchemaType.BOOLEAN, description: 'Збірний вантаж' },
                isPriceRequest: { type: SchemaType.BOOLEAN, description: 'Запит ціни (якщо ціна договірна або не вказана)' },
                description: { type: SchemaType.STRING, description: 'Інші деталі (температура, палети, черга)' },
            },
            required: ['origin', 'destination'],
        };

        return this.aiService.extractDataAsJson<{
            origin: string;
            destination: string;
            cargoName?: string;
            weight?: number;
            volume?: number;
            price?: number;
            currency?: string;
            truckCount?: number;
            truckTypes?: string[];
            dateLoad?: string;
            dateUnload?: string;
            isCollective?: boolean;
            isPriceRequest?: boolean;
            description?: string;
        }>(
            prompt,
            schema,
            images
        );
    }

    async parseTruckDocument(images: Express.Multer.File[]) {
        const prompt = `Проаналізуй фото документа і витягни характеристики вантажівки.`;

        // Явно вказуємо тип Schema
        const schema: Schema = {
            type: SchemaType.OBJECT,
            properties: {
                plateNumber: { type: SchemaType.STRING },
                truckType: { type: SchemaType.STRING, description: 'Наприклад: Тент, Зерновоз, Рефрижератор' },
                carryingCapacity: { type: SchemaType.NUMBER, description: 'Вантажопідйомність (т)' },
            },
        };

        return this.aiService.extractDataAsJson(prompt, schema, images);
    }
}