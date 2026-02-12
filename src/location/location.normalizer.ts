import { UA_REGION_CODES } from './ua-regions.map';
import { NormalizedLocation } from './location.types';

/* ---------------- HELPERS ---------------- */
function extractPostCode(result: any): string | null {
  const components = result.address_components ?? [];

  // 1. Намагаємось знайти в офіційних компонентах
  const fromComponent = components.find((c) =>
    c.types.includes('postal_code'),
  )?.long_name;
  if (fromComponent) return fromComponent;

  // 2. Якщо немає (як для Гданська), шукаємо в рядку formatted_address через Regex
  // Для Європи та України формати зазвичай: 80-001 або 79000
  const address = result.formatted_address || '';
  const postCodeMatch =
    address.match(/\b\d{2}-\d{3}\b/) || address.match(/\b\d{5}\b/);

  return postCodeMatch ? postCodeMatch[0] : null;
}
function getComponent(
  components: any[],
  type: string,
  field: 'long_name' | 'short_name' = 'long_name',
): string | null {
  return components.find((c) => c.types.includes(type))?.[field] ?? null;
}

function hasType(components: any[], type: string): boolean {
  return components.some((c) => c.types.includes(type));
}

/* ---------------- CORE EXTRACTORS ---------------- */

function extractCity(components: any[]): string | null {
  return (
    getComponent(components, 'sublocality_level_1') || // Спробуйте цей пріоритет
    getComponent(components, 'locality') ||
    getComponent(components, 'postal_town') ||
    getComponent(components, 'administrative_area_level_2')
  );
}

function extractStreet(components: any[]): string | null {
  return getComponent(components, 'route');
}

function extractHouse(components: any[]): string | null {
  return getComponent(components, 'street_number');
}

function extractSettlementType(
  components: any[],
): NormalizedLocation['settlementType'] {
  if (hasType(components, 'route')) return 'street';
  if (hasType(components, 'locality')) return 'city';
  return 'settlement'; // село / смт
}

export function normalizeGooglePlace(result: any, displayName?: string): NormalizedLocation {
  const components = result.address_components ?? [];
  const countryCode = getComponent(components, 'country', 'short_name');
  
  const street = extractStreet(components);
  const house = extractHouse(components);
  
  // --- НОВА ЛОГІКА ВИБОРУ МІСТА (City) ---
  let city: string | null = null;

  // 1. Пріоритет №1: Назва, яку юзер бачив у списку (напр. "Синдос, Греція")
  if (displayName && !street) {
    // Беремо текст до першої коми (щоб відсікти країну/область)
    city = displayName.split(',')[0].trim();
  } 

  // 2. Пріоритет №2: Якщо displayName немає, або він "кривий", беремо name з Google Details
  if (!city || city === 'Текелиево') {
    city = (result.name && result.name !== 'Текелиево') ? result.name : null;
  }
  
  // 3. Пріоритет №3: Шукаємо в офіційних компонентах (locality)
  if (!city || city === 'Текелиево') {
     city = extractCity(components);
  }

  // 4. Пріоритет №4: Якщо всюди "Текелиево", тягнемо з formatted_address
  if ((!city || city === 'Текелиево') && result.formatted_address) {
    const firstPart = result.formatted_address.split(',')[0].trim();
    if (!/\d/.test(firstPart)) { // перевірка, що це не номер будинку
       city = firstPart;
    }
  }

  // Решта коду без змін
  const region = getComponent(components, 'administrative_area_level_1');
  const settlementType = extractSettlementType(components);
  const postCode = extractPostCode(result);
  const lat = result.geometry?.location?.lat ?? null;
  const lng = result.geometry?.location?.lng ?? null;

  const baseLocation = {
    street,
    house,
    postCode,
    city,
    settlementType,
    lat,
    lng,
  };

  /* --------- ЛОГІКА ДЛЯ УКРАЇНИ --------- */
  if (countryCode === 'UA') {
    const isKyiv = city === 'Київ';
    const finalRegion = isKyiv ? 'Київська область' : region;
    let regionCode: string | null = null;
    
    if (isKyiv) {
      regionCode = 'UA-30';
    } else if (finalRegion && UA_REGION_CODES[finalRegion]) {
      regionCode = UA_REGION_CODES[finalRegion];
    }

    return {
      ...baseLocation,
      region: finalRegion,
      regionCode, 
      country: 'Україна',
      countryCode: 'UA',
    };
  }

  /* --------- ІНШІ КРАЇНИ --------- */
  return {
    ...baseLocation,
    region,
    regionCode: null,
    country: getComponent(components, 'country'),
    countryCode,
  };
}