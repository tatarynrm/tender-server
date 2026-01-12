import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class FormDataService {
  public constructor(
    private readonly dbservice: DatabaseService,
    @Inject('PG_POOL') private readonly pool: Pool,
  ) {}

  public async getPreAddTenderData() {
    const result = await this.dbservice.callProcedure(
      'tender_form_data',

      {},

      {},
    );


    return result;
  }
}
