import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

import { TenderGateway } from './tender.gateway';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';
import { LoadGateway } from 'src/crm/load/load.gateway';

@Injectable()
export class TenderService {
  public constructor(
    private readonly dbservice: DatabaseService,
    private readonly tenderGateway: TenderGateway,
    private readonly loadGateway: LoadGateway,
  ) {}

  public async getList(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);

    console.log(filters, 'FILTERS');

    const result = await this.dbservice.callProcedure(
      'tender_list_ict',

      {
        pagination: {
          per_page: query.limit ?? 10,
          page: query.page ?? 1,
        },
        filter: filters,
      },

      {},
    );

    return result;
  }
  public async getClientList(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);

    const result = await this.dbservice.callProcedure(
      'tender_list',

      {
        pagination: {
          per_page: query.limit ?? 10,
          page: query.page ?? 1,
        },
        filter: filters,
      },

      {},
    );

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
  // FOR MANAGERS
  public async getListFormData(query: any) {
    const result = await this.dbservice.callProcedure(
      'tender_list_form_data',

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
    console.log(result.content[0], 'CONTENT 90 line ');

    this.tenderGateway.emitToAll('new_tender', result.content[0]);

    return result;
  }
  public async getOne(id: string) {
    const result = await this.dbservice.callProcedure(
      'tender_one_ict',

      { id: id },

      {},
    );

    return result;
  }
  public async getOneList(id: string) {
    const result = await this.dbservice.callProcedure(
      'tender_list_ict',

      { id: id },

      {},
    );

    return result;
  }

  public async tenderSetRate(dto: any) {
    console.log(dto, 'DTO');
    const result = await this.dbservice.callProcedure(
      'tender_set_rate',

      dto,

      {},
    );

    const tenderForIct = await this.getOneList(result.content[0].tender_id);

    this.tenderGateway.emitToAll('new_bid', result.content[0]);
    // Для наших менеджерів!
    this.loadGateway.emitToAll('new_bid', tenderForIct.content[0]);

    return result;
  }

  public async tenderSetStatus(dto: any) {
    const result = await this.dbservice.callProcedure(
      'tender_set_status',

      dto,

      {},
    );

    // this.tenderGateway.emitToAll('tender_status_updated', dto);
    return result;
  }
  public async tenderSetWinner(dto: any) {
    const result = await this.dbservice.callProcedure(
      'tender_set_winner',

      dto,

      {},
    );

    // this.tenderGateway.emitToAll('tender_status_updated', dto);
    return result;
  }
}
