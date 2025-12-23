import {
  Global,
  Inject,
  Injectable,
  NotFoundException,
  Scope,
} from '@nestjs/common';

import { Pool } from 'pg';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

export type DbResponse<T = any> =
  | {
      status: 'ok';
      content: T;
    }
  | {
      status: 'error';
      error_message: string;
      error_code?: string;
    };

interface AuthObject {
  id_usr?: number | string | null;
  id_company?: number | string | null;
}

@Injectable({ scope: Scope.REQUEST }) // 👈 обов’язково request-scoped
export class DatabaseService {
  constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    @Inject(REQUEST)
    private readonly request: Request & {
      user?: { id_user?: number; id_company?: number };
    },
  ) {}

  public async callProcedure(
    procedureName: string,
    dataObject: any = {},
    resultObject: any = {},
  ) {
    // ⚡ Автоматично формуємо authObject з request.user
    const authObject: AuthObject = {
      id_usr: this.request.user?.id ?? null,
      id_company: this.request.user?.id_company ?? null,
    };
    console.log(
      authObject,
      'AUTH OBJECT IN CALL PROCDERUE FUNCTION database service 49 line test',
    );

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
}
