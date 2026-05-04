import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as oracledb from 'oracledb';

@Injectable()
export class DatabaseOracleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseOracleService.name);
  private pool: oracledb.Pool;

  async onModuleInit() {
    try {
      this.pool = await oracledb.createPool({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASSWORD,
        connectString: process.env.ORACLE_CONN_STRING,
        poolMin: 1,
        poolMax: 10,
        poolIncrement: 1,
      });


      this.logger.log('Oracle Connection Pool created');
    } catch (err) {
      this.logger.error('Oracle Pool Error: ', err);
    }
  }

  async executeProcedure<T>(
    funcName: string,
    params: Record<string, any> = {},
  ): Promise<T | null> {
    let connection: oracledb.Connection | undefined;

    try {
      connection = await this.pool.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ICTDAT`);

      // Формуємо bind-змінні. Додаємо змінну :ret для результату функції
      const bindVars = {
        ...params,
        ret: {
          dir: oracledb.BIND_OUT,
          type: oracledb.STRING,
          maxSize: 1000000, // Або oracledb.CLOB, якщо JSON дуже великий
        },
      };

      // Формуємо рядок параметрів (без :ret, бо воно зліва від :=)
      const keys = Object.keys(params);
      const placeholders = keys.map((key) => `:${key}`).join(', ');

      // Генеруємо SQL: BEGIN :ret := func_name(:param1, :param2); END;
      const sql = `BEGIN :ret := ${funcName}(${placeholders}); END;`;

      const result = await connection.execute(sql, bindVars);

      const rawData = (result.outBinds as any)?.ret;
      return rawData ? (JSON.parse(rawData) as T) : null;
    } catch (err) {
      this.logger.error(`Error executing function ${funcName}`, err);
      throw err;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          this.logger.error('Error closing connection', closeErr);
        }
      }
    }
  }

  async executeQuery<T>(
    sql: string,
    params: Record<string, any> = {},
  ): Promise<T[]> {
    let connection: oracledb.Connection | undefined;

    try {
      connection = await this.pool.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ICTDAT`);
      const result = await connection.execute<T>(sql, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      console.log(result, 'result');

      return result.rows || [];
    } catch (err) {
      this.logger.error(`Error executing query: ${sql}`, err);
      throw err;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (closeErr) {
          this.logger.error('Error closing connection', closeErr);
        }
      }
    }
  }
  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close(0);
    }
  }
}
