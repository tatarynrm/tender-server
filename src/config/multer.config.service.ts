import { Injectable } from '@nestjs/common';
import {
  MulterModuleOptions,
  MulterOptionsFactory,
} from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { multerFileFilter, MULTER_LIMITS } from './multer-file-filter';

@Injectable()
export class MulterConfigService implements MulterOptionsFactory {
  createMulterOptions(): MulterModuleOptions {
    return {
      storage: memoryStorage(),
      limits: MULTER_LIMITS, // 30MB
      fileFilter: multerFileFilter,
    };
  }
}
