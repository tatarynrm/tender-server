import { Injectable } from '@nestjs/common';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { DatabaseService } from 'src/database/database.service';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';
import { LoadGateway } from './load.gateway';
import { Request } from 'express';
import { CrmLoadListDto } from './dto/crm-load-list.dto';

@Injectable()
export class LoadService {
  public constructor(
    private readonly dbservice: DatabaseService,
    private readonly loadGateway: LoadGateway,
  ) {}
  public async save(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_save',

      dto,

      {},
    );

    const exactLoad = await this.findOne(result.content[0]);

    if (dto.id) {
      this.loadGateway.emitToAll('edit_load', exactLoad.content[0]);
    }
    this.loadGateway.emitToAll('new_load', exactLoad.content[0]);
    return result;
  }
  public async addCars(dto: any) {
    console.log(dto, 'dto 37');

    const result = await this.dbservice.callProcedure(
      'crm_load_car_add_save',

      dto,

      {},
    );
    console.log(result, 'result --add car');
    // Отримуємо актуальний стан вантажу з бази (з новим часом останнього коментаря)
    const exactLoad = await this.findOne(dto.id_crm_load);
    const updatedItem = exactLoad.content[0];
    this.loadGateway.emitToAll('load_add_car', updatedItem);

    // this.loadGateway.emitToAll('new_load', result.content[0]);
    return result;
  }
  public async removeCars(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_car_cancel_save',

      dto,

      {},
    );
    const exactLoad = await this.findOne(dto.id_crm_load);
    const updatedItem = exactLoad.content[0];
    this.loadGateway.emitToAll('load_remove_car', updatedItem);

    // this.loadGateway.emitToAll('new_load', result.content[0]);
    return result;
  }
  public async closeByManager(dto: any) {
    console.log(dto, 'DTRO');

    const result = await this.dbservice.callProcedure(
      'crm_load_car_close_save',

      dto,

      {},
    );

    this.loadGateway.emitToAll(
      'edit_load_car_close_by_manager',
      result.content[0],
    );

    // this.loadGateway.emitToAll('new_load', result.content[0]);
    return result;
  }
  public async cargoHistory(id: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_car_history',

      {
        id_crm_load: id,
      },

      {},
    );

    // this.loadGateway.emitToAll('new_load', result.content[0]);
    return result;
  }
  public async getLoadChat(id: any) {
    console.log(id, 'DTRO');

    const result = await this.dbservice.callProcedure(
      'crm_load_car_history',

      {
        id: id,
      },

      {},
    );

    // this.loadGateway.emitToAll('new_load', result.content[0]);
    return result;
  }
  public async saveComment(dto: any, req: Request) {
    console.log(dto, 'DTO COMMENT ID');

    const isEditing = !!dto.id; // Перевіряємо наявність ID коментаря

    const result = await this.dbservice.callProcedure(
      'crm_load_comment_save',
      dto,
      {},
    );

    // Отримуємо актуальний стан вантажу (для оновлення лічильників на картках)
    const exactLoad = await this.findOne(dto.id_crm_load);
    const updatedLoad = exactLoad.content[0];

    // Визначаємо тип події для чату
    const chatEvent = isEditing ? 'load_comment_updated' : 'new_load_comment';

    // 1. Сповіщаємо про зміну стану вантажу (лічильники, дати)
    this.loadGateway.emitToAll('update_load', {
      ...updatedLoad,
      sender_id: req.user.id,
    });

    // 2. Сповіщаємо про конкретну дію в чаті
    this.loadGateway.emitToAll(chatEvent, {
      id_crm_load: dto.id_crm_load,
      comment: result[0], // процедура має повертати оновлений об'єкт коментаря
      sender_id: req.user.id,
    });

    return result;
  }
  public async deleteComment(commentId: number, loadId: number, req: Request) {
    const result = await this.dbservice.callProcedure(
      'crm_load_comment_delete', // Назва вашої процедури видалення
      { id: commentId },
      {},
    );

    // Отримуємо актуальний стан вантажу після видалення коментаря
    const exactLoad = await this.findOne(loadId);
    const updatedItem = exactLoad.content[0];

    // Розсилаємо через сокети подію 'delete_load_comment' або 'new_load_comment'
    // (зазвичай краще оновити весь об'єкт вантажу, щоб зник індикатор останнього коментаря)
    this.loadGateway.emitToAll('new_load_comment', {
      ...updatedItem,
      sender_id: req.user.id,
    });

    return result;
  }
  public async getComments(id: any) {
    console.log(id, 'COMMENTS GET');

    const result = await this.dbservice.callProcedure(
      'crm_load_comments',

      { id_crm_load: id },

      {},
    );

    // this.loadGateway.emitToAll('new_load', result.content[0]);
    return result;
  }
  public async setAsRead(dto: any) {
    // dto має містити { id_crm_load: ... } або просто id
    const result = await this.dbservice.callProcedure(
      'crm_load_comment_read_set',
      dto,
      {},
    );

    // Отримуємо оновлений вантаж, де лічильник вже має бути 0
    const exactLoad = await this.findOne(dto.id_crm_load);
    const updatedItem = exactLoad.content[0];
    console.log(updatedItem, 'UPDATE ITEM ----- 157');

    // Повідомляємо іншим вкладкам/користувачам, що цей вантаж прочитано
    // (Але завдяки logic з датою у майбутньому, у автора коментарів нічого не смикнеться)
    this.loadGateway.emitToAll('update_chat_count_load', updatedItem);

    return result;
  }
  public async loadUpdate(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_update',

      {
        id: dto.id,
      },

      {},
    );

    const exactLoad = await this.findOne(result.content.id);
    console.log(exactLoad, 'EXACT LOAD');
    this.loadGateway.emitToAll('update_load_date', exactLoad.content[0]);
    return result;
  }
  public async loadCopy(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_copy',

      {
        id_crm_load: dto.id,
      },

      {},
    );
    console.log(result, 'RESULT');

    const exactLoad = await this.findOne(result.content.id);

    this.loadGateway.emitToAll('update_load', exactLoad.content[0]);
    return result;
  }
  public async getList(query: CrmLoadListDto) {
    console.log(query, 'CLEAN QUERY');

    const filters: FilterItem[] = buildFiltersFromQuery(query);

    const result = await this.dbservice.callProcedure(
      'crm_load_list',
      {
        pagination: {
          per_page: query.limit, // вже число
          page: query.page, // вже число
        },
        filter: filters,
      },
      {},
    );

    return result;
  }

  public async getOneLoad(id: number) {
    console.log(id, 'ID');

    const result = await this.dbservice.callProcedure(
      'crm_load_one',
      {
        id: id,
      },
      {},
    );

    return result;
  }
  public async findOne(id: number) {
    // return `This action returns a #${id} load`;
    const result = await this.dbservice.callProcedure(
      'crm_load_list',

      { id: id },

      {},
    );

    return result;
  }
  public async loadDelete(id: number) {
    // return `This action returns a #${id} load`;
    console.log(id, 'dto delete');

    const result = await this.dbservice.callProcedure(
      'crm_load_delete',

      { id: id },

      {},
    );
    this.loadGateway.emitToAll('delete_load', id);
    return result;
  }
  public async loadHistoryDelete(dto: { id: number; table: string }) {
    // Формуємо назву процедури: беремо назву таблиці та додаємо суфікс
    const procedureName = `${dto.table}_delete`;

    console.log(`Calling procedure: ${procedureName} for ID: ${dto.id}`);
    console.log(dto, 'DTO');

    // Викликаємо процедуру в БД
    const result = await this.dbservice.callProcedure(
      procedureName,
      { id: dto.id }, // передаємо ID запису, який треба видалити
      {},
    );
    console.log(result, 'RESULT');

    return result;
  }
}
