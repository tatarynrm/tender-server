import 'express';

declare module 'express' {
  interface Request {
    user?: any; // або твій тип користувача, наприклад User
    session?: any; // якщо потрібно
  }
}

declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }
  }
}
