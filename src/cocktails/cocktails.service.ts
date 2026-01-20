import {
  Injectable,
  Inject,
  InternalServerErrorException,
} from '@nestjs/common';
import { unlink } from 'fs/promises';

import { join } from 'path';
import { Pool } from 'pg';

// ... (імпорти залишаються)

@Injectable()
export class CocktailsService {
  constructor(@Inject('PG_POOL') private readonly db: Pool) {}

  async create(dto: any, files: Express.Multer.File[], session: any) {
    if (!session || !session.id_company) {
      throw new InternalServerErrorException('Сесія не знайдена');
    }

    const currentUserId = session.userId || session.id_user || session.id;
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // 1. Створюємо коктейль
      const cocktailRes = await client.query(
        `INSERT INTO cocktails (name, description, price, id_company, id_user) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          dto.name,
          dto.description,
          dto.price,
          session.id_company,
          currentUserId,
        ],
      );
      const cocktailId = cocktailRes.rows[0].id;

      // 2. Обробляємо кастомні імена з body
      let displayNames: string[] = [];
      try {
        displayNames = dto.files_names ? JSON.parse(dto.files_names) : [];
      } catch (e) {
        console.error('Помилка парсингу імен:', e);
      }

      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          if (!file.path)
            throw new Error(`Файл ${file.originalname} не має шляху`);

          const fileUrl = file.path
            .replace(process.cwd(), '')
            .replace(/\\/g, '/');

          // Пріоритет: Кастомне ім'я від користувача -> Оригінальне ім'я файлу
          const finalDisplayName = displayNames[i] || file.originalname;
   

          await client.query(
            `INSERT INTO files (file_url, original_name, mimetype, size, id_company, id_user, entity_id, entity_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              fileUrl,
              finalDisplayName, // Тепер тут буде "Мій коктейль", а не "image_213.jpg"
              file.mimetype,
              file.size,
              session.id_company,
              currentUserId,
              cocktailId,
              'COCKTAIL_IMAGE',
            ],
          );
        }
      }

      await client.query('COMMIT');
      return { success: true, id: cocktailId };
    } catch (e) {
      await client.query('ROLLBACK');
      throw new InternalServerErrorException(e.message);
    } finally {
      client.release();
    }
  }

  // cocktails.service.ts
  async findAll(id_company: number) {
    const query = `
    SELECT 
      c.*, 
      COALESCE(
        json_agg(
          json_build_object(
            'id', f.id,
            'url', f.file_url
          )
        ) FILTER (WHERE f.id IS NOT NULL), '[]'
      ) as images
    FROM cocktails c
    LEFT JOIN files f ON c.id = f.entity_id AND f.entity_type = 'COCKTAIL_IMAGE'
    WHERE c.id_company = $1
    GROUP BY c.id
    ORDER BY c.id DESC;
  `;
    const res = await this.db.query(query, [id_company]);
    return res.rows;
  }
  async remove(id: number, companyId: number) {
    // 1. Отримуємо шлях до файлів перед видаленням з БД
    const filesQuery = `SELECT file_url FROM files WHERE entity_id = $1 AND entity_type = 'COCKTAIL_IMAGE'`;
    const filesRes = await this.db.query(filesQuery, [id]);

    // 2. Видаляємо файли з диска
    for (const file of filesRes.rows) {
      const fullPath = join(process.cwd(), file.file_url);
      try {
        await unlink(fullPath);
      } catch (err) {
        console.error(`Не вдалося видалити файл: ${fullPath}`, err);
      }
    }

    // 3. Видаляємо записи з БД (завдяки зв'язкам або окремими запитами)
    await this.db.query(
      `DELETE FROM cocktails WHERE id = $1 AND id_company = $2`,
      [id, companyId],
    );
    return { success: true };
  }

  async updateAvatar(userId: number, file: Express.Multer.File) {
    // 1. Формуємо шлях до файлу (як ти робиш для коктейлів)
    if (!file.path) {
      throw new Error(`Файл не має шляху на диску`);
    }

    const fileUrl = file.path.replace(process.cwd(), '').replace(/\\/g, '/');

    const client = await this.db.connect();
    try {
      // 2. Використовуємо ON CONFLICT для PostgreSQL
      const query = `
      INSERT INTO usr_avatar (usr_id, avatar_path, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (usr_id) 
      DO UPDATE SET 
        avatar_path = EXCLUDED.avatar_path,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

      const res = await client.query(query, [userId, fileUrl]);

      return { success: true, data: res.rows[0] };
    } catch (e) {
      console.error('Помилка при оновленні аватара:', e);
      throw new InternalServerErrorException('Не вдалося зберегти аватар');
    } finally {
      client.release();
    }
  }
}
