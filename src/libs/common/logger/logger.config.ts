import { WinstonModule } from 'nest-winston'
import * as winston from 'winston'
import 'winston-daily-rotate-file'

export const loggerConfig = WinstonModule.createLogger({
  // 1. Додаємо глобальний формат для обробки помилок
  format: winston.format.combine(
    winston.format.errors({ stack: true }), // Витягує стек-трейс з об'єкта Error
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize({ all: true }),
        winston.format.printf((info: any) => {
          const { timestamp, level, message, context, stack } = info
          // 2. Якщо є стек-трейс, додаємо його з нового рядка
          const errorMessage = stack ? `${message}\n${stack}` : message
          return `[Nest] ${timestamp} ${level} [${context || 'App'}] ${errorMessage}`
        }),
      ),
    }),

    new winston.transports.DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(), // У JSON стек-трейс додасться автоматично як поле "stack"
      ),
    }),

    new winston.transports.DailyRotateFile({
      level: 'error',
      filename: 'logs/errors-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(), // Тут теж буде повний JSON з усіма деталями помилки
      ),
    }),
  ],
})
