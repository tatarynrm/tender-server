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
          //   components: 'country:ua',
          language: 'uk',
          // types: 'geocode', 
          // Прибираємо types щоб шукало все повністю
          key: process.env.GOOGLE_API_KEY,
        },
      },
    );

    return data;
  }

  async resolve(placeId: string) {
    const { data } = await axios.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: placeId,
          fields: 'address_components,geometry,formatted_address',
          language: 'uk',
          key: process.env.GOOGLE_API_KEY,
        },
      },
    );
    console.log(JSON.stringify(data, null, 2));

    return normalizeGooglePlace(data.result);
  }
}
