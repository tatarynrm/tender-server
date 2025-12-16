import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DatabaseService } from 'src/database/database.service';
import { GetTransportQueryDto } from './dto/get-transport-query.dto';

@Injectable()
export class TransportService {
  public constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly dbservice: DatabaseService,
  ) {}

  public async pageInfo(dto: any) {
    const result = await this.dbservice.callProcedure(
      'vehicle_list_form_data',

      {
        // filter: [{ type: 'where', expression: 'not a.main' }],
      },

      {},
    );
    console.log(result, 'result');

    return result;
  }
  public async transportList(dto: GetTransportQueryDto) {
    const { type, page = 1, limit = 10 } = dto;
    const expression = type === 'TRUCK' ? 'a.main' : 'not a.main';
    // Формуємо параметри для процедури
    const procedureParams = {
      filter: type ? [{ type: 'where', expression:expression }] : [],
      pagination: { page, limit },
    };

    // Виклик збереженої процедури
    const result = await this.dbservice.callProcedure(
      'vehicle_list',
      procedureParams,
      {},
    );

    return result;
  }

  async getByType(type: 'TRUCK' | 'TRAILER') {
    // return this.transportRepo.find({ where: { type } });
  }
}
