import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { S3Service } from 'src/shared/services/s3.service';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly dbservice: DatabaseService,
    private readonly s3Service: S3Service,
  ) { }

  /**
   * Syncs files for a specific entity (like a tender).
   * @param tblref Table name or entity type (e.g., 'tenders')
   * @param id_tblref ID of the entity
   * @param currentFiles List of existing file IDs to keep
   * @param newFiles New files to upload
   */
  async syncFiles(
    tblref: string,
    id_tblref: number,
    currentFiles: number[] = [],
    newFiles: Express.Multer.File[] = [],
    id_company?: string | number,
  ) {
    if (!id_tblref) return;




    // 1. Отримуємо список існуючих файлів прямо з таблиці, 
    // оскільки процедури для лістингу немає.
    const query = `SELECT id, key FROM files WHERE tblref = $1 AND id_tblref = $2`;
    const dbResult = await this.dbservice.query(query, [tblref.toUpperCase(), id_tblref]);

    const existingFiles = dbResult.rows || [];

    // 2. Визначаємо, які файли потрібно видалити
    // (ті, що є в базі, але їхніх ID немає у списку currentFiles від фронта)
    const filesToDelete = existingFiles.filter(
      (f: any) => !currentFiles.includes(Number(f.id)),
    );


    for (const file of filesToDelete) {
      try {
        if (file.key) {
          await this.s3Service.deleteFile(file.key);
        }
        await this.dbservice.callProcedure('files_delete', { id: file.id }, {});
      } catch (error) {
        this.logger.error(`Failed to delete file ${file.id}: ${error.message}`);
      }
    }

    // 3. Завантажуємо нові файли
    for (const file of newFiles) {
      try {
        const s3Data = await this.s3Service.uploadFile(file, tblref, id_company);

        await this.dbservice.callProcedure('files_save', {
          tblref,
          id_tblref,
          display_name: s3Data.fileName,
          file_name: s3Data.fileName,
          extension: s3Data.extension,
          file_size: s3Data.fileSize,
          url: s3Data.url,
          key: s3Data.key,
          code: 'DEFAULT',
        }, {});
      } catch (error) {
        this.logger.error(`Failed to upload file ${file.originalname}: ${error.message}`);
      }
    }
  }
}
