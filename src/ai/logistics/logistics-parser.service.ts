// src/logistics/logistics-parser.service.ts
import { Injectable } from '@nestjs/common';
import { SchemaType, Schema } from '@google/generative-ai';
import { AiService } from '../ai.service';

@Injectable()
export class LogisticsParserService {
  constructor(private readonly aiService: AiService) {}

  async parseCargo(
    text: string,
    images?: Express.Multer.File[],
    audio?: Express.Multer.File[],
  ) {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Експерт-логіст. Витягни дані про вантажі (масив 'loads') з наданого тексту та/або ПРИКРІПЛЕНИХ ФАЙЛІВ (фото документів, скріншоти, аудіо).
        Дата: ${today}.
        ПРАВИЛА:
        - Адреси: розбивай на місто, вулицю, будинок (напр. "Київ" (city), "Бажана" (street), "12" (house)). НЕ пиши номер будинку в вулицю!
        - Гроші: "грн" -> currency: "UAH". "50к" -> price: 50000.
        - Транспорт: "20т" - це вага. "Тент/Реф" - це truckTypes.
        - Якщо є температурний режим це Реф.
        - Дати: dateLoad (початок), dateLoad2 (кінець завантаження), dateUnload.
        - Опис вантажу: description. Додавай максимально деталізований опис вантажу!
        - Якщо в тексті є щось про замитнення та розмитення не додавай ці пункти в точки загрузки чи вигрузки, лише додай цю інформацію в опис.        - Мова: ПЕРЕКЛАДАЙ НА УКРАЇНСЬКУ.
        ВХІДНИЙ ТЕКСТ: """${text}"""
        АНАЛІЗУЙ ФОТО ТА АУДІО ЯКЩО ВОНИ Є.ЯКЩО ФОТО ДЕКІЛКЬКА - АНАЛІЗУЙ ВСІ,ЩОБ К-СТЬ РЕЗУЛЬТАТІВ ЗБІГАЛАСЬ З К-СТЮ ФОТО. `;

    const allFiles = [...(images || []), ...(audio || [])];

    const locationSchema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        address: {
          type: SchemaType.STRING,
          description: 'Повна адреса або місто',
        },
        city: { type: SchemaType.STRING, description: 'Місто' },
        ids_country: {
          type: SchemaType.STRING,
          description: 'Країна ISO (напр. UA, PL)',
        },
        lat: { type: SchemaType.NUMBER },
        lon: { type: SchemaType.NUMBER },
        ids_region: {
          type: SchemaType.STRING,
          description:
            'ISO код регіону (наприклад, UA-46 для Львова або UA-37)',
        },
        street: {
          type: SchemaType.STRING,
          description: 'Вулиця (наприклад, Наукова)',
        },
        house: {
          type: SchemaType.STRING,
          description: 'Номер будинку (наприклад, 37)',
        },
      },
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
        truckTypes: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        dateLoad: { type: SchemaType.STRING },
        dateLoad2: { type: SchemaType.STRING },
        dateUnload: { type: SchemaType.STRING },
        isCollective: { type: SchemaType.BOOLEAN },
        isPriceRequest: { type: SchemaType.BOOLEAN },
        description: { type: SchemaType.STRING },
        companyName: {
          type: SchemaType.STRING,
          description: 'Назва компанії або замовника',
        },
      },
      required: ['origins', 'destinations'],
    };

    const schema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        loads: {
          type: SchemaType.ARRAY,
          items: cargoSchema,
          description: 'Список знайдених заявок',
        },
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
    }>(prompt, schema, allFiles);
  }

  async parseTender(
    text: string,
    images?: Express.Multer.File[],
    audio?: Express.Multer.File[],
  ) {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Експерт-логіст. Витягни дані про тендери (масив 'loads') з наданого тексту та/або ПРИКРІПЛЕНИХ ФАЙЛІВ (фото документів, скріншоти, аудіо).
        Дата: ${today}.
        ПРАВИЛА:
        - ТЕНДЕР: це запит на перевезення вантажу. 
        - Адреси: розбивай на місто, вулицю, будинок (напр. "Київ" (city), "Бажана" (street), "12" (house)). НЕ пиши номер будинку в вулицю!
        - Гроші: "грн" -> currency: "UAH". "50к" -> price: 50000.
        - Транспорт: "20т" - це вага. "Тент/Реф" - це truckTypes.
        - Акцент на деталізацію вантажу та вимоги.
        - Мова: ПЕРЕКЛАДАЙ НА УКРАЇНСЬКУ.
        ВХІДНИЙ ТЕКСТ: """${text}"""
        АНАЛІЗУЙ ФОТО ТА АУДІО ЯКЩО ВОНИ Є.`;

    const allFiles = [...(images || []), ...(audio || [])];

    const locationSchema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        address: { type: SchemaType.STRING, description: 'Повна адреса або місто' },
        city: { type: SchemaType.STRING, description: 'Місто' },
        ids_country: { type: SchemaType.STRING, description: 'Країна ISO (напр. UA, PL)' },
        lat: { type: SchemaType.NUMBER },
        lon: { type: SchemaType.NUMBER },
        ids_region: { type: SchemaType.STRING, description: 'ISO код регіону' },
        street: { type: SchemaType.STRING, description: 'Вулиця' },
        house: { type: SchemaType.STRING, description: 'Номер будинку' },
      },
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
        dateLoad2: { type: SchemaType.STRING },
        dateUnload: { type: SchemaType.STRING },
        isCollective: { type: SchemaType.BOOLEAN },
        isPriceRequest: { type: SchemaType.BOOLEAN },
        description: { type: SchemaType.STRING },
        companyName: { type: SchemaType.STRING, description: 'Назва компанії' },
      },
      required: ['origins', 'destinations'],
    };

    const schema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        loads: { type: SchemaType.ARRAY, items: cargoSchema, description: 'Список знайдених тендерів' },
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
    }>(prompt, schema, allFiles);
  }

  async parseTruckDocument(images: Express.Multer.File[]) {
    const prompt = `Проаналізуй фото документа і витягни характеристики вантажівки.`;

    const schema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        plateNumber: { type: SchemaType.STRING },
        truckType: {
          type: SchemaType.STRING,
          description: 'Наприклад: Тент, Зерновоз, Рефрижератор',
        },
        carryingCapacity: {
          type: SchemaType.NUMBER,
          description: 'Вантажопідйомність (т)',
        },
      },
    };

    return this.aiService.extractDataAsJson(prompt, schema, images);
  }
}
