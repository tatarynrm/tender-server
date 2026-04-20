import {
  Global,
  Inject,
  Injectable,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { Pool } from 'pg';
// import { REQUEST } from '@nestjs/core';
// import type { Request } from 'express';

export type DbResponse<T = any> =
  | {
      status: 'ok';
      content: T;
      props?: T;
      add_data?: T;
    }
  | {
      status: 'error';
      error_message: string;
      error_code?: string;
    };

// @Injectable({ scope: Scope.REQUEST }) // 👈 обов’язково request-scoped
@Injectable() // 👈 обов’язково request-scoped
export class DatabaseService {
  constructor(
    private readonly cls: ClsService, // Доступ до контексту
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

  public async callProcedure(
    procedureName: string,
    dataObject: any = {},
    resultObject: any = {},
  ) {
    const user = this.cls.get('user'); // Дістаємо без Scope.REQUEST
    const authObject = user?.id
      ? { id_usr: user.id, id_company: user.company?.id }
      : {};

    console.log(authObject, 'AUTH OBJECT AUTH DATABASEW SERVICE 😎😎😎😎');

    const query = `CALL run($1, $2, $3, $4)`;

    const result = await this.pool.query(query, [
      procedureName,
      authObject,
      dataObject,
      resultObject,
    ]);

    const data: DbResponse = result.rows[0]?.res;

    if (!data) {
      throw new NotFoundException('Порожня відповідь від БД');
    }

    if (data.status === 'error') {
      throw new NotFoundException(data.error_message);
    }

    return data;
  }

  public async getClient() {
    const client = await this.pool.connect();
    return client;
  }

  public async query(query: string, params: any[] = []) {
    return this.pool.query(query, params);
  }
}
