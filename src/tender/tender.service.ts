import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { FilesService } from 'src/files/files.service';
// import { TenderSaveDto } from './interfaces/tender-save.interface';

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
    private readonly filesService: FilesService, // Added this line
  ) { }

  public async getList(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);

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
  public async save(dto: any, files: Express.Multer.File[] = [], id_company?: string | number) {
    if (Array.isArray(dto.tender_permission)) {
      dto.tender_permission = dto.tender_permission.filter((x: any) => x && x.ids_permission_type);
    }
    if (Array.isArray(dto.tender_trailer)) {
      dto.tender_trailer = dto.tender_trailer.filter((x: any) => x && x.ids_trailer_type);
    }
    if (Array.isArray(dto.tender_load)) {
      dto.tender_load = dto.tender_load.filter((x: any) => x && x.ids_load_type);
    }

    const result = await this.dbservice.callProcedure(
      'tender_save',
      dto,
      {},
    );

    // After saving tender, sync its files
    try {

      const savedTender = result.content[0];
      const tenderId = savedTender || savedTender?.id_tender || dto.id;


      if (tenderId) {
        const currentFileIds = Array.isArray(dto.current_file_ids)
          ? dto.current_file_ids.map(Number)
          : [];

        await this.filesService.syncFiles('tender', Number(tenderId), currentFileIds, files, id_company);
      }
    } catch (fileError) {
      console.error('Error syncing files for tender:', fileError);
      // We don't want to fail the whole tender save if file sync fails
    }

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

    const updatedTenderId = result.content.id_tender;

    this.tenderGateway.emitToAll('tender_status_updated', updatedTenderId);
    return result;
  }
  public async tenderDelWinner(dto: any) {
    const result = await this.dbservice.callProcedure(
      'tender_del_winner',

      dto,

      {},
    );
    const updatedTenderId = result.content.id_tender;

    this.tenderGateway.emitToAll('tender_status_updated', updatedTenderId);
    return result;
  }
}
