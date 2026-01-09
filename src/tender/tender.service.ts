import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

import { TenderGateway } from './tender.gateway';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';

@Injectable()
export class TenderService {
  public constructor(
    private readonly dbservice: DatabaseService,
    private readonly tenderGateway: TenderGateway,
  ) {}

  public async getList(dto: any) {
    const result = await this.dbservice.callProcedure(
      'tender_list',

      {
        pagination: {
          per_page: 10,
        },
      },

      {},
    );
    console.log(result, 'TENDERS');

    return result;
  }
  public async getClientList(query: any) {
    console.log(query, 'Q?UERY');

    const filters: FilterItem[] = buildFiltersFromQuery(query);


    const result = await this.dbservice.callProcedure(
      'tender_list_client',

      {
        pagination: {
          per_page: query.limit ?? 10,
          page: query.page ?? 1,
        },
        filter: filters,
      },

      {},
    );
    // console.log(result,'RESULT KYIV');

    return result;
  }
  public async getClientListFormData(query: any) {
    const result = await this.dbservice.callProcedure(
      'tender_list_client_form_data',

      {},

      {},
    );

    return result;
  }
  public async save(dto: any) {
    const result = await this.dbservice.callProcedure(
      'tender_save',

      dto,

      {},
    );
    console.log(result.content, 'RESULT CONTENT');

    this.tenderGateway.emitToAll('saveTender', result.content[0]);
    return result;
  }
  public async getOne(id: string) {
    console.log(id, 'ID IN SERVICE');

    const result = await this.dbservice.callProcedure(
      'tender_one',

      { id: id },

      {},
    );
    console.log(result, 'TENDER ONE--------');

    return result;
  }

  public async tenderSetRate(dto: any) {
    console.log('SET RATE FUNC----------------------------');

    const result = await this.dbservice.callProcedure(
      'tender_set_rate',

      dto,

      {},
    );

    this.tenderGateway.emitToAll('new_bid', result.content[0]);

    return result;
  }
}
