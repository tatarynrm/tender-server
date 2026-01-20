// import { Injectable, BadRequestException } from '@nestjs/common';
// import {
//   MulterModuleOptions,
//   MulterOptionsFactory,
// } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import { existsSync, mkdirSync } from 'fs';
// import { join, extname } from 'path';

// @Injectable()
// export class MulterConfigService implements MulterOptionsFactory {
//   createMulterOptions(): MulterModuleOptions {
//     return {
//       storage: diskStorage({
//         destination: (req: any, file, cb) => {
//           // 1. Отримуємо дані (залежно від вашої сесії/passport)
//           const companyId = req.user?.id_company || req.session?.id_company;
//           const userId = req.user?.id || req.session?.userId;
//           console.log(companyId, 'companyt id config 20 ');
//           console.log(userId, 'user id  multer config 20');
//           console.log('--- NEW UPLOAD ATTEMPT ---');
//           console.log('Fieldname:', file.fieldname);
//           console.log('Body folderType:', req.body.folderType);
//           console.log('Session UserID:', req.session?.userId || req.user?.id);

//           // 2. СУВОРА ПЕРЕВІРКА: якщо даних немає, повертаємо помилку
//           if (!companyId || !userId) {
//             return cb(
//               new BadRequestException(
//                 'Завантаження заборонено: Користувач не авторизований або компанія не вказана',
//               ),
//               '',
//             );
//           }

//           console.log(req.body.folderType, 'FOLDER TYPE CONFIG 32');

//           // 3. Тип папки
//           const folderType = req.body.folderType || 'general';

//           // 4. Будуємо шлях
//           let subPath = '';
//           if (folderType === 'avatar') {
//             subPath = join(String(companyId), String(userId), 'avatar');
//           } else {
//             subPath = join(String(companyId), folderType);
//           }

//           const uploadPath = join(process.cwd(), 'uploads', subPath);

//           // 5. Створюємо папки
//           if (!existsSync(uploadPath)) {
//             mkdirSync(uploadPath, { recursive: true });
//           }

//           cb(null, uploadPath);
//         },
//         filename: (req, file, cb) => {
//           const uniqueSuffix =
//             Date.now() + '-' + Math.round(Math.random() * 1e9);
//           cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
//         },
//       }),
//       // Додатково: обмеження за розміром (наприклад, 5MB)
//       limits: {
//         fileSize: 100 * 1024 * 1024, // 100MB у байтах
//       },
//       // Додатково можна додати фільтр типів файлів, якщо потрібно
//       fileFilter: (req, file, cb) => {
//         // Твоя логіка фільтрації (опціонально)
//         cb(null, true);
//       },
//     };
//   }
// }
// import { Injectable, BadRequestException } from '@nestjs/common';
// import {
//   MulterModuleOptions,
//   MulterOptionsFactory,
// } from '@nestjs/platform-express';
// import { diskStorage } from 'multer';
// import { existsSync, mkdirSync } from 'fs';
// import { join, extname } from 'path';

// @Injectable()
// export class MulterConfigService implements MulterOptionsFactory {
//   createMulterOptions(): MulterModuleOptions {
//     return {
//       storage: diskStorage({
//         destination: (req: any, file, cb) => {
//           // Отримуємо ID з сесії або паспорта
//           const companyId = req.session?.id_company || req.user?.id_company;
//           const userId = req.session?.userId || req.session?.id || req.user?.id;

//           if (!companyId || !userId) {
//             return cb(
//               new BadRequestException('Користувач не авторизований'),
//               '',
//             );
//           }

//           // ❗ ПРІОРИТЕТ: Query -> Body -> Default
//           const folderType =
//             req.query.folderType || req.body.folderType || 'general';

//           let subPath = '';
//           if (folderType === 'avatar') {
//             subPath = join(String(companyId), String(userId), 'avatar');
//           } else {
//             subPath = join(String(companyId), String(folderType));
//           }

//           const uploadPath = join(process.cwd(), 'uploads', subPath);

//           if (!existsSync(uploadPath)) {
//             mkdirSync(uploadPath, { recursive: true });
//           }

//           cb(null, uploadPath);
//         },
//         filename: (req, file, cb) => {
//           const uniqueSuffix =
//             Date.now() + '-' + Math.round(Math.random() * 1e9);
//           cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
//         },
//       }),
//       limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
//     };
//   }
// }
import { Injectable, BadRequestException } from '@nestjs/common';
import {
  MulterModuleOptions,
  MulterOptionsFactory,
} from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';

@Injectable()
export class MulterConfigService implements MulterOptionsFactory {
  createMulterOptions(): MulterModuleOptions {
    return {
      storage: diskStorage({
        destination: (req: any, file, cb) => {
          const companyId = req.session?.id_company || req.user?.id_company;
          const userId = req.session?.userId || req.session?.id || req.user?.id;

          if (!companyId || !userId) {
            return cb(
              new BadRequestException('Користувач не авторизований'),
              '',
            );
          }

          const folderType =
            req.query.folderType || req.body.folderType || 'general';

          let subPath = '';
          if (folderType === 'avatar') {
            subPath = join(String(companyId), String(userId), 'avatar');
          } else {
            subPath = join(String(companyId), String(folderType));
          }

          const uploadPath = join(process.cwd(), 'uploads', subPath);
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }

          cb(null, uploadPath);
        },
        filename: (req: any, file, cb) => {
          // 1. Ініціалізуємо індекс
          if (req._fileIndex === undefined) req._fileIndex = 0;

          let finalBaseName: string;
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);

          try {
            // 2. Спробуємо дістати кастомні імена
            const namesRaw = req.body.files_names;
            const names = namesRaw ? JSON.parse(namesRaw) : [];

            // Беремо ім'я за індексом, якщо воно є і це рядок
            const customName = names[req._fileIndex];

            if (
              typeof customName === 'string' &&
              customName.trim().length > 0
            ) {
              // Очищаємо від спецсимволів (залишаємо букви, цифри, пробіли, тире)
              finalBaseName = customName.replace(/[^a-z0-9а-яіїєґ \-_]/gi, '_');
            } else {
              finalBaseName = uniqueSuffix;
            }
          } catch (e) {
            finalBaseName = uniqueSuffix;
          }

          // 3. Формуємо повне ім'я з розширенням
          const extension = extname(file.originalname);
          const fileName = `${finalBaseName}-${uniqueSuffix}${extension}`;

          // 4. Інкрементуємо індекс
          req._fileIndex++;

          cb(null, fileName);
        },
      }),
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    };
  }
}
