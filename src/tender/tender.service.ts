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

  /**
   * Скільки тендерів проведено з цим замовником + його Oracle-код (migrate_id)
   * для підтяжки рейсів з Oracle, і базові реквізити компанії (Postgres-бік
   * інформації про замовника — Oracle-бік тягнеться окремо через
   * p_tender.GetCompany). Прямий SELECT — окремої процедури під це немає.
   */
  public async getCustomerStats(companyName: string) {
    const result = await this.dbservice.query(
      `SELECT c.id, c.migrate_id, c.company_name_full, c.edrpou, c.address,
              c.is_blocked, c.black_list, c.created_at,
              COUNT(DISTINCT t.id)::int AS tender_count
       FROM company c
       LEFT JOIN tender t ON t.id_owner_company = c.id
       WHERE c.company_name = $1
       GROUP BY c.id, c.migrate_id, c.company_name_full, c.edrpou, c.address,
                c.is_blocked, c.black_list, c.created_at`,
      [companyName],
    );

    return (
      result.rows[0] ?? { id: null, migrate_id: null, tender_count: 0 }
    );
  }

  /**
   * Тендери конкретного замовника з автором (наш менеджер, tender.id_author
   * → person) і всіма ставками перевізників по кожному (tender_rate: хто
   * з якої компанії скільки запропонував). Прямий SELECT, пагінація по
   * тендерах — ставки не розбиваються між сторінками.
   */
  public async getCustomerTenderDetails(
    companyId: number,
    page: number,
    perPage: number,
  ) {
    const offset = (page - 1) * perPage;

    const [tendersResult, countResult] = await Promise.all([
      this.dbservice.query(
        `SELECT t.id, t.cargo, t.created_at, t.ids_status,
                p_author.surname || ' ' || p_author.name AS author_name
         FROM tender t
         LEFT JOIN person p_author ON p_author.id = t.id_author
         WHERE t.id_owner_company = $1
         ORDER BY t.created_at DESC
         LIMIT $2 OFFSET $3`,
        [companyId, perPage, offset],
      ),
      this.dbservice.query(
        `SELECT COUNT(*)::int AS cnt FROM tender WHERE id_owner_company = $1`,
        [companyId],
      ),
    ]);

    const tenderIds = tendersResult.rows.map((r: any) => r.id);
    const bidsByTender = new Map<number, any[]>();

    if (tenderIds.length > 0) {
      const bidsResult = await this.dbservice.query(
        `SELECT tr.id_tender, tr.id AS rate_id, tr.price_proposed, tr.car_count,
                tr.time_add, tr.notes,
                c.company_name AS carrier_name,
                p_bidder.surname || ' ' || p_bidder.name AS bidder_name
         FROM tender_rate tr
         LEFT JOIN company c ON c.id = tr.id_company
         LEFT JOIN person p_bidder ON p_bidder.id = tr.id_author
         WHERE tr.id_tender = ANY($1::bigint[])
         ORDER BY tr.time_add DESC`,
        [tenderIds],
      );

      for (const row of bidsResult.rows) {
        if (!bidsByTender.has(row.id_tender)) {
          bidsByTender.set(row.id_tender, []);
        }
        bidsByTender.get(row.id_tender)!.push({
          id: row.rate_id,
          carrier_name: row.carrier_name,
          bidder_name: row.bidder_name,
          price_proposed: row.price_proposed,
          car_count: row.car_count,
          time_add: row.time_add,
          notes: row.notes,
        });
      }
    }

    const total = countResult.rows[0]?.cnt ?? 0;

    return {
      rows: tendersResult.rows.map((t: any) => ({
        id: t.id,
        cargo: t.cargo,
        created_at: t.created_at,
        ids_status: t.ids_status,
        author_name: t.author_name,
        bids: bidsByTender.get(t.id) ?? [],
      })),
      total,
      page,
      perPage,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  private getSortString(query: any): string {
    const sortBy = query.sortBy || 'time_start';
    const sortOrder = query.sortOrder || 'DESC';

    const columns: Record<string, string> = {
      time_start: 'a.time_start',
      time_end: 'a.time_end',
    };

    const column = columns[sortBy] || 'a.time_start';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    return `${column} ${order}`;
  }

  public async getList(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);
    const sortString = this.getSortString(query);

    const result = await this.dbservice.callProcedure('tender_list_ict', {
      pagination: {
        per_page: query.limit ?? 10,
        page: query.page ?? 1,
      },
      filter: filters,
      sort: sortString,
    });

    return result;
  }
  public async getClientList(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);
    const sortString = this.getSortString(query);
    const result = await this.dbservice.callProcedure('tender_list', {
      pagination: {
        per_page: query.limit ?? 10,
        page: query.page ?? 1,
      },
      filter: filters,
      sort: sortString,
    });

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
  public async save(
    dto: any,
    files: Express.Multer.File[] = [],
    id_company?: string | number,
  ) {
    if (Array.isArray(dto.tender_permission)) {
      dto.tender_permission = dto.tender_permission.filter(
        (x: any) => x && x.ids_permission_type,
      );
    }
    if (Array.isArray(dto.tender_trailer)) {
      dto.tender_trailer = dto.tender_trailer.filter(
        (x: any) => x && x.ids_trailer_type,
      );
    }
    if (Array.isArray(dto.tender_load)) {
      dto.tender_load = dto.tender_load.filter(
        (x: any) => x && x.ids_load_type,
      );
    }

    const result = await this.dbservice.callProcedure('tender_save', dto, {});

    // After saving tender, sync its files
    try {
      const savedTender = result.content[0];
      const tenderId = savedTender || savedTender?.id_tender || dto.id;

      if (tenderId) {
        const currentFileIds = Array.isArray(dto.current_file_ids)
          ? dto.current_file_ids.map(Number)
          : [];

        await this.filesService.syncFiles(
          'tender',
          Number(tenderId),
          currentFileIds,
          files,
          id_company,
        );
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

    const preparedResult = { ...result.content[0] };
    delete preparedResult.person_price_proposed;
    delete preparedResult.person_offer_car_count;
    delete preparedResult.person_winner_car_count;

    const preparedTenderIct = { ...tenderForIct.content[0] };
    delete preparedTenderIct.person_price_proposed;
    delete preparedTenderIct.person_offer_car_count;
    delete preparedTenderIct.person_winner_car_count;

    this.tenderGateway.emitToAll('new_bid', preparedResult);
    // Для наших менеджерів!
    this.loadGateway.emitToAll('new_bid', preparedTenderIct);

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

  public async sendCustomNotification(dto: any) {

    const result = await this.dbservice.callProcedure(
      'tender_notify_message',
      dto,
      {},
    );
    return result;
  }

  public async sendResultNotification(id: string) {
    const result = await this.dbservice.callProcedure(
      'tender_notify_result',
      { id_tender: id },
      {},
    );
    return result;
  }
  public async tenderSetAgree(dto: any) {
    const result = await this.dbservice.callProcedure(
      'tender_set_agree',
      dto,
      {},
    );
    return result;
  }
  public async tenderNotifyProlongation(dto: any) {
    const result = await this.dbservice.callProcedure(
      'tender_notify_prolongation',
      dto,
      {},
    );
    return result;
  }
}
