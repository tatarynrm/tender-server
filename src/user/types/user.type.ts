import { AuthMethod } from "src/types/auth.types";
import { UserRole } from "src/types/roles.types";


export interface IUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
  picture: string | null;
  role: UserRole;
  isVerified: boolean;
  isTwoFactorEnabled: boolean;
  method: AuthMethod;
  createdAt: Date;
  updatedAt: Date;
  is_ict?:boolean;
  id_company?:number;
}