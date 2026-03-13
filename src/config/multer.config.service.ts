import { Injectable, BadRequestException } from '@nestjs/common';
import {
  MulterModuleOptions,
  MulterOptionsFactory,
} from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';

/**
 * Service to configure Multer for file uploads.
 * Currently uses disk storage. For high-scale horizontal scaling, 
 * this should be replaced with S3/MinIO storage.
 */
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
              new BadRequestException('Unauthorized: No company or user ID found'),
              '',
            );
          }

          const folderType = req.query.folderType || req.body.folderType || 'general';

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
          if (req._fileIndex === undefined) req._fileIndex = 0;

          let finalBaseName: string;
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);

          try {
            const namesRaw = req.body.files_names;
            const names = namesRaw ? JSON.parse(namesRaw) : [];
            const customName = names[req._fileIndex];

            if (typeof customName === 'string' && customName.trim().length > 0) {
              finalBaseName = customName.replace(/[^a-z0-9а-яіїєґ \-_]/gi, '_');
            } else {
              finalBaseName = uniqueSuffix;
            }
          } catch (e) {
            finalBaseName = uniqueSuffix;
          }

          const extension = extname(file.originalname);
          const fileName = `${finalBaseName}-${uniqueSuffix}${extension}`;
          req._fileIndex++;

          cb(null, fileName);
        },
      }),
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    };
  }
}
