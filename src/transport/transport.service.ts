import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class TransportService {
  public constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly dbservice: DatabaseService,
  ) {}

  public async transportList() {
    const result = await this.dbservice.callProcedure(
      'vehicle_list',

      {},

      {},
    );
    return result;
  }
}
