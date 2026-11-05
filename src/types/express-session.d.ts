import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    personId?: number;
    ict?: boolean;
    id_company?: number;
  }
}
