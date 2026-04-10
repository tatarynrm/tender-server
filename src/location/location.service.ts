import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { normalizeGooglePlace } from './location.normalizer';

@Injectable()
export class LocationService {
  constructor() {}

  async autocomplete(input: string) {
    const { data } = await axios.get(
      'https://maps.googleapis.com/maps/api/place/autocomplete/json',
      {
        params: {
          input,
          language: 'uk',
          key: process.env.GOOGLE_API_KEY,
        },
      },
    );

    return data;
  }

  async resolve(placeId: string, displayName?: string) {
    const { data } = await axios.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: placeId,
          fields: 'address_components,geometry,formatted_address,name',
          language: 'uk',
          key: process.env.GOOGLE_API_KEY,
        },
      },
    );

    return normalizeGooglePlace(data.result, displayName);
  }

  async geocode(address: string) {
    try {
      const { data } = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: {
            address,
            language: 'uk',
            key: process.env.GOOGLE_API_KEY,
          },
        },
      );

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        return null;
      }

      const result = normalizeGooglePlace(data.results[0]);
      
      return {
        ...result,
        lon: result.lng, // Для сумісності з DTO
      };
    } catch (error) {
      console.error('Google Geocoding Error:', error.message);
      return null;
    }
  }
}
