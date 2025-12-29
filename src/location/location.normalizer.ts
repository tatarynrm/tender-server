import { UA_REGION_CODES } from "./ua-regions.map";
import { NormalizedLocation } from "./location.types";

/* ---------------- HELPERS ---------------- */

function getComponent(
  components: any[],
  type: string,
  field: "long_name" | "short_name" = "long_name",
): string | null {
  return components.find(c => c.types.includes(type))?.[field] ?? null;
}

function hasType(components: any[], type: string): boolean {
  return components.some(c => c.types.includes(type));
}

/* ---------------- CORE EXTRACTORS ---------------- */

function extractCity(components: any[]): string | null {
  return (
    getComponent(components, "locality") ||
    getComponent(components, "administrative_area_level_2") ||
    getComponent(components, "administrative_area_level_3")
  );
}

function extractStreet(components: any[]): string | null {
  return getComponent(components, "route");
}

function extractHouse(components: any[]): string | null {
  return getComponent(components, "street_number");
}

function extractSettlementType(components: any[]): NormalizedLocation["settlementType"] {
  if (hasType(components, "route")) return "street";
  if (hasType(components, "locality")) return "city";
  return "settlement"; // село / смт
}

/* ---------------- MAIN NORMALIZER ---------------- */

export function normalizeGooglePlace(result: any): NormalizedLocation {
  const components = result.address_components ?? [];

  const countryCode = getComponent(components, "country", "short_name");
  const country = getComponent(components, "country");
  const city = extractCity(components);
  const region = getComponent(components, "administrative_area_level_1");
  const street = extractStreet(components);
  const house = extractHouse(components);
  const settlementType = extractSettlementType(components);

  const lat = result.geometry?.location?.lat ?? null;
  const lng = result.geometry?.location?.lng ?? null;

  /* --------- SPECIAL CASE: KYIV --------- */
  if (countryCode === "UA" && city === "Київ") {
    return {
      street,
      house,
      city: "Київ",
      settlementType,
      region: 'Київська область',
      regionCode: "UA-30",
      country: "Україна",
      countryCode: "UA",
      lat,
      lng,
    };
  }

  /* --------- UKRAINE --------- */
  if (countryCode === "UA") {
    return {
      street,
      house,
      city,
      settlementType,
      region,
      regionCode: region ? UA_REGION_CODES[region] ?? null : null,
      country: "Україна",
      countryCode: "UA",
      lat,
      lng,
    };
  }

  /* --------- OTHER COUNTRIES --------- */
  return {
    street,
    house,
    city,
    settlementType,
    region: null,
    regionCode: null,
    country,
    countryCode,
    lat,
    lng,
  };
}
