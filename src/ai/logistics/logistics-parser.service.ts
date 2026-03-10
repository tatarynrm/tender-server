// src/logistics/logistics-parser.service.ts
import { Injectable } from '@nestjs/common';
import { SchemaType, Schema } from '@google/generative-ai';
import { AiService } from '../ai.service';

@Injectable()
export class LogisticsParserService {
    constructor(private readonly aiService: AiService) { }

    async parseCargo(text: string, images?: Express.Multer.File[], audio?: Express.Multer.File[]) {
        const today = new Date().toISOString().split('T')[0];
        const prompt = `Ти — висококваліфікований логіст-аналітик. Твоє завдання — витягнути ПОВНИЙ список усіх заявок на перевезення з наданих матеріалів.
        
        МАТЕРІАЛИ МОЖУТЬ МІСТИТИ:
        - Декілька скріншотів (кожен скріншот може бути окремою заявкою).
        - Довгий текст з декількома пропозиціями.
        - Фото документів (ТТН, договори).
        - Аудіоповідомлення (транскрибуй голос та витягни дані).
        
        КРИТИЧНІ ПРАВИЛА:
        1. ОБОВ'ЯЗКОВО поверни масив 'loads'. Якщо знайдено 5 заявок — поверни 5 об'єктів у масиві.
        2. НЕ ОБ'ЄДНУЙ різні заявки в одну. Кожен маршрут або кожен окремий вантаж — це окрема чернетка.
        3. Для кожної заявки максимально детально заповни всі поля.
        4. Дати: YYYY-MM-DD. Сьогодні — ${today}.
        5. ТРАНСПОРТ: Якщо тип не вказаний — став ["Крита"].
        6. ВАЖЛИВО: Проаналізуй КОЖНЕ завантажене фото та аудіо окремо та витягни з нього дані.
        7. МОВА: Навіть якщо вхідні дані (текст, фото або голос) на іноземній мові, ТИ ПОВИНЕН ПЕРЕКЛАСТИ ВСЕ НА УКРАЇНСЬКУ. Назви міст, типи вантажу, описи — все тільки українською.
        8. ФОРМАТ: Твоя відповідь має містити масив об'єктів у полі 'loads'.
        
        ТЕКСТ (якщо є): 
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
                ids_region: { type: SchemaType.STRING },
                street: { type: SchemaType.STRING },
                house: { type: SchemaType.STRING },
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