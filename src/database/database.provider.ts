import { Pool, types } from 'pg';
import { ConfigService } from '@nestjs/config';

// Тип 20 = BIGINT
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
// Тип 1700 = NUMERIC
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

export const databaseProviders = [
  {
    provide: 'PG_POOL',
    useFactory: async (configService: ConfigService) => {
      const pool = new Pool({
        host: configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        user: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
      });
      return pool;
    },
    inject: [ConfigService],
  },
];
