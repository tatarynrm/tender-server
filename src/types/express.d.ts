import 'express';

declare module 'express' {
  interface Request {
    user?: any; // або твій тип користувача, наприклад User
    session?: any; // якщо потрібно
  }
}