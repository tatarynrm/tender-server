// transport.dto.ts
export type TransportFilter = {
  type?: 'TRUCK' | 'TRAILER';
};
export class Transport {
  id: string;
  vin: string;
  type: 'TRUCK' | 'TRAILER';
  brand: string;
  model: string;
}