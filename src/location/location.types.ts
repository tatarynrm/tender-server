export type NormalizedLocation = {
  street: string | null;
  house: string | null;
  city: string | null;
  town?: string | null;
  village?: string | null;
  settlementType: "city" | "settlement" | "street";
  region: string | null;
  regionCode: string | null;
  country: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  postCode: string | null;
};
