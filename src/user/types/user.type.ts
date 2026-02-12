export interface IUserProfile {
  id: number;
  role: IUserRole;
  email: string;
  person: IPerson;
  company: ICompany;
  verified: boolean;
  department: IDepartment;
  is_blocked: boolean;
}

export interface IUserRole {
  is_ict: boolean;
  is_admin: boolean;
  is_manager: boolean;
}

export interface IPerson {
  id: number;
  name: string;
  ids_sex: 'M' | 'F' | string; // Використовуємо union type для статі
  surname: string;
  birthday: string | null;
  last_name: string;
}

export interface ICompany {
  id: number;
  devid: number | null;
  edrpou: string;
  gps_lat: number | null;
  gps_lon: number | null;
  web_site: string;
  is_client: boolean;
  black_list: boolean;
  is_blocked: boolean;
  is_carrier: boolean;
  ids_country: string;
  company_form: string;
  company_name: string;
  is_expedition: boolean;
}

export interface IDepartment {
  id: number;
  idnt: any | null; // Замінити на конкретний тип, якщо відома структура idnt
  root_company: number;
  department_name: string;
}