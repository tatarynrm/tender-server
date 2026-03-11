// src/logistics/logistics-parser.service.ts
import { Injectable } from '@nestjs/common';
import { SchemaType, Schema } from '@google/generative-ai';
import { AiService } from '../ai.service';

@Injectable()
export class LogisticsParserService {
    constructor(private readonly aiService: AiService) { }

    async parseCargo(text: string, images?: Express.Multer.File[], audio?: Express.Multer.File[]) {
        const today = new Date().toISOString().split('T')[0];
        const prompt = `Ти — висококваліфікований логіст-аналітик. Твоя мета — витягти дані про вантаж. Сьогодні ${today}.
        
        КРИТИЧНІ ПРАВИЛА:
        1. ОБОВ'ЯЗКОВО поверни масив 'loads'. Якщо в тексті є хоча б одна згадка маршруту — створи об'єкт.
        2. РОЗПІЗНАВАННЯ АДРЕС: Якщо вказано "Львів Наукова 37", то місто — Львів, вулиця — Наукова, будинок — 37.
        3. ЦІНА ТА ВАЛЮТА: Якщо вказано "грн" — валюта "UAH". "50900 грн" -> price: 50900, currency: "UAH".
        4. ВАНТАЖ: "борошно на палетах 20 тон" — cargoName: "Борошно на палетах", weight: 20.
        5. ТРАНСПОРТ: "теннт" або подібне — це тип "Тент". "20 тон" — це вага (weight).
        6. МОВА: ПЕРЕКЛАДАЙ ВСЕ НА УКРАЇНСЬКУ.
        7. ФОРМАТ: Тільки JSON.
        
        ВХІДНИЙ ТЕКСТ: 
        """${text}"""`;

        const allFiles = [...(images || []), ...(audio || [])];

        const locationSchema: Schema = {
            type: SchemaType.OBJECT,
            properties: {
                address: { type: SchemaType.STRING, description: 'Повна адреса або місто' },
                city: { type: SchemaType.STRING, description: 'Місто' },
                country: { type: SchemaType.STRING, description: 'Країна ISO' },
                lat: { type: SchemaType.NUMBER },
                lon: { type: SchemaType.NUMBER },
                ids_region: { type: SchemaType.STRING, description: 'ISO код регіону (наприклад, UA-46 для Львова або UA-37)' },
                street: { type: SchemaType.STRING, description: 'Вулиця (наприклад, Наукова)' },
                house: { type: SchemaType.STRING, description: 'Номер будинку (наприклад, 37)' },
            }
        };

        const cargoSchema: Schema = {
            type: SchemaType.OBJECT,
            properties: {
                origins: { type: SchemaType.ARRAY, items: locationSchema },
                destinations: { type: SchemaType.ARRAY, items: locationSchema },
                cargoName: { type: SchemaType.STRING },
                weight: { type: SchemaType.NUMBER },
                volume: { type: SchemaType.NUMBER },
                price: { type: SchemaType.NUMBER },
                currency: { type: SchemaType.STRING },
                truckCount: { type: SchemaType.NUMBER },
                truckTypes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                dateLoad: { type: SchemaType.STRING },
                dateUnload: { type: SchemaType.STRING },
                isCollective: { type: SchemaType.BOOLEAN },
                isPriceRequest: { type: SchemaType.BOOLEAN },
                description: { type: SchemaType.STRING },
                companyName: { type: SchemaType.STRING, description: 'Назва компанії або замовника' },
            },
            required: ['origins', 'destinations'],
        };

        const schema: Schema = {
            type: SchemaType.OBJECT,
            properties: {
                loads: {
                    type: SchemaType.ARRAY,
                    items: cargoSchema,
                    description: 'Список знайдених заявок'
                }
            },
            required: ['loads'],
        };

        return this.aiService.extractDataAsJson<{
            loads: Array<{
                origins: any[];
                destinations: any[];
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
                companyName?: string;
            }>;
        }>(
            prompt,
            schema,
            allFiles
        );
    }

    async parseTruckDocument(images: Express.Multer.File[]) {
        const prompt = `Проаналізуй фото документа і витягни характеристики вантажівки.`;

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