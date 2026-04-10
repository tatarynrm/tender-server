// src/logistics/logistics-parser.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { SchemaType, Schema } from '@google/generative-ai';
import { AiService } from '../ai.service';
import { LocationService } from '../../location/location.service';

@Injectable()
export class LogisticsParserService {
  private readonly logger = new Logger(LogisticsParserService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly locationService: LocationService,
  ) { }

  private async geocodeLocations(locations: any[]) {
    if (!locations || !Array.isArray(locations)) return [];

    return Promise.all(
      locations.map(async (loc) => {
        const query = loc.address || loc.city || '';
        if (!query || query.length < 2) {
            return { ...loc, ids_country: loc.ids_country || 'UA' };
        }

        try {
          const googleResult = await this.locationService.geocode(query);
          if (googleResult) {
            return {
              ...loc,
              lat: googleResult.lat ? Number(googleResult.lat.toFixed(6)) : undefined,
              lon: googleResult.lon ? Number(googleResult.lon.toFixed(6)) : undefined,
              ids_country: googleResult.countryCode || loc.ids_country || 'UA',
              city: googleResult.city || loc.city,
              ids_region: googleResult.regionCode || loc.ids_region,
              post_code: googleResult.postCode || loc.post_code,
              street: googleResult.street || loc.street,
              house: googleResult.house || loc.house,
            };
          }
        } catch (err) {
          this.logger.warn(`Google Geocoding failed for ${query}: ${err.message}`);
        }
        return {
          ...loc,
          ids_country: loc.ids_country || 'UA',
        };
      }),
    );
  }

  async parseCargo(text: string, images?: Express.Multer.File[], audio?: Express.Multer.File[]) {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Експерт-логіст. Витягни дані про вантажі (масив 'loads') з наданого тексту та/або ПРИКРІПЛЕНИХ ФАЙЛІВ (фото документів, скріншоти, аудіо).
        Дата: ${today}.
        ПРАВИЛА:
        - Адреси: розбивай на місто, вулицю, будинок. НЕ пиши номер будинку в вулицю!
        - Гроші: "грн" -> currency: "UAH". "50к" -> price: 50000.
        - Транспорт: "20т" - це вага. "Тент/Реф" - це truckTypes.
        - Мова: ПЕРЕКЛАДАЙ НА УКРАЇНСЬКУ.
        ВХІДНИЙ ТЕКСТ: """${text}"""`;

    const allFiles = [...(images || []), ...(audio || [])];

    const locationSchema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        address: { type: SchemaType.STRING, description: 'Повна адреса або місто' },
        city: { type: SchemaType.STRING },
        ids_country: { type: SchemaType.STRING, description: 'ISO код країни (UA, PL...)' },
        lat: { type: SchemaType.NUMBER },
        lon: { type: SchemaType.NUMBER },
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
        dateUnload: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING },
      },
      required: ['origins', 'destinations'],
    };

    const schema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        loads: { type: SchemaType.ARRAY, items: cargoSchema },
      },
      required: ['loads'],
    };

    const result = await this.aiService.extractDataAsJson<{ loads: any[] }>(prompt, schema, allFiles);

    if (result?.loads) {
      for (const load of result.loads) {
        load.origins = await this.geocodeLocations(load.origins);
        load.destinations = await this.geocodeLocations(load.destinations);
      }
    }

    return result;
  }

  async parseTender(text: string, images?: Express.Multer.File[], audio?: Express.Multer.File[]) {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Експерт-логіст. Витягни дані про тендери (масив 'loads') з наданого тексту та/або фото/аудіо документів.
        Дата: ${today}.
        ПРАВИЛА:
        - ТЕНДЕР: це запит на перевезення вантажу. 
        - Адреси: ПРІОРИТЕТ - витягнути координати (lat, lon), поштовий індекс (post_code) та деталі.
        - ids_country: ЗАВЖДИ вказуй ISO код країни (UA, RO, PL, DE, MD).
        - Мова: ПЕРЕКЛАДАЙ НА УКРАЇНСЬКУ.
        ВХІДНИЙ ТЕКСТ: """${text}"""`;

    const allFiles = [...(images || []), ...(audio || [])];

    const locationSchema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        address: { type: SchemaType.STRING, description: 'Повна адреса для відображення' },
        city: { type: SchemaType.STRING, description: 'Місто' },
        ids_country: { type: SchemaType.STRING, description: 'ISO код країни (UA, PL, RO...)' },
        post_code: { type: SchemaType.STRING, description: 'Поштовий індекс' },
        street: { type: SchemaType.STRING, description: 'Вулиця' },
        house: { type: SchemaType.STRING, description: 'Номер будинку' },
        lat: { type: SchemaType.NUMBER, description: 'Широта' },
        lon: { type: SchemaType.NUMBER, description: 'Довгота' },
      },
    };

    const cargoSchema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        origins: { type: SchemaType.ARRAY, items: locationSchema },
        destinations: { type: SchemaType.ARRAY, items: locationSchema },
        cargoName: { type: SchemaType.STRING, description: 'Назва вантажу (макс 25 симв)' },
        weight: { type: SchemaType.NUMBER, description: 'Вага (т)' },
        volume: { type: SchemaType.NUMBER, description: 'Об`єм (м3)' },
        price: { type: SchemaType.NUMBER, description: 'Бюджет тендеру / Стартова ціна' },
        currency: { type: SchemaType.STRING, description: 'Валюта (UAH, EUR, USD)' },
        truckCount: { type: SchemaType.NUMBER, description: 'Кількість машин' },
        truckTypes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: 'Типи транспорту' },
        dateLoad: { type: SchemaType.STRING, description: 'Дата початку завантаження (YYYY-MM-DD)' },
        dateLoad2: { type: SchemaType.STRING, description: 'Дата кінця завантаження' },
        dateUnload: { type: SchemaType.STRING, description: 'Дата розвантаження' },
        tenderStart: { type: SchemaType.STRING, description: 'Дата/час початку самого тендеру' },
        tenderEnd: { type: SchemaType.STRING, description: 'Дата/час завершення прийому ставок' },
        description: { type: SchemaType.STRING, description: 'Усі деталі вантажу, температурний режим, особливі умови' },
        companyName: { type: SchemaType.STRING, description: 'Замовник' },
      },
      required: ['origins', 'destinations'],
    };

    const schema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        loads: { type: SchemaType.ARRAY, items: cargoSchema },
      },
      required: ['loads'],
    };

    const result = await this.aiService.extractDataAsJson<{ loads: any[] }>(prompt, schema, allFiles);

    if (result?.loads) {
      for (const load of result.loads) {
        load.origins = await this.geocodeLocations(load.origins);
        load.destinations = await this.geocodeLocations(load.destinations);
      }
    }

    return result;
  }

  async parseTruckDocument(images: Express.Multer.File[]) {
    const prompt = `Проаналізуй фото документа і витягни характеристики вантажівки.`;
    const schema: Schema = {
      type: SchemaType.OBJECT,
      properties: {
        plateNumber: { type: SchemaType.STRING },
        truckType: { type: SchemaType.STRING },
        carryingCapacity: { type: SchemaType.NUMBER },
      },
    };
    return this.aiService.extractDataAsJson(prompt, schema, images);
  }
}
