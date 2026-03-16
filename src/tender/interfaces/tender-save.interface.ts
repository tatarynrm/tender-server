export interface TenderSaveDto {
  id?: number;
  cargo: string;
  notes?: string;
  id_owner_company: number | null;
  car_count: number;
  price_start?: number;
  price_step?: number;
  price_redemption?: number;
  ids_type: string;
  ids_carrier_rating: string;
  request_price: boolean;
  without_vat: boolean;
  tender_route: any[]; // Or define a more detailed route interface
  tender_trailer: any[];
  tender_load: any[];
  tender_permission?: any[];
  company_name?: string | null;
  load_info?: string;
  volume: number;
  weight: number;
  palet_count: number;
  ids_valut?: string;
  cost_redemption?: number;
  ref_temperature_to?: number | null;
  ref_temperature_from?: number | null;
  time_start: Date | string;
  time_end?: Date | string | null;
  date_load: Date | string;
  date_load2?: Date | string | null;
  date_unload?: Date | string | null;
  current_file_ids?: number[]; // Added for file sync
}
