import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from 'src/database/database.service';
import { LoadGateway } from './load.gateway';
import { SOCKET_EVENTS } from 'src/shared/utils/constants/socket-events';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';
import { CrmLoadListDto } from './dto/crm-load-list.dto';
import { TelegramService } from 'src/telegram/telegram.service';

@Injectable()
export class LoadService {
  private readonly logger = new Logger(LoadService.name);

  constructor(
    private readonly dbservice: DatabaseService,
    private readonly loadGateway: LoadGateway,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Універсальний метод для еміту оновленого об'єкта вантажу
   */
  private async emitLoadUpdate(id: number, event: string, extraData = {}) {
    const response = await this.findOne(id);
    const updatedItem = response.content[0];
    console.log(updatedItem, 'ITEM');

    await this.telegramService.sendNewLoadToTelegramGroup(updatedItem);
    if (updatedItem) {
      this.loadGateway.emitToAll(event, { ...updatedItem, ...extraData });
    }
    return updatedItem;
  }

  async save(dto: any) {
    const isEditing = !!dto.id;
    const result = await this.dbservice.callProcedure('crm_load_save', dto);
    const loadId = isEditing ? dto.id : result.content[0];

    // Використовуємо EDIT або NEW з констант
    const event = isEditing ? SOCKET_EVENTS.LOAD.EDIT : SOCKET_EVENTS.LOAD.NEW;
    await this.emitLoadUpdate(loadId, event);

    return result;
  }

  async addCars(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_car_add_save',
      dto,
    );
    await this.emitLoadUpdate(dto.id_crm_load, SOCKET_EVENTS.LOAD.ADD_CAR);
    return result;
  }

  async removeCars(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_car_cancel_save',
      dto,
    );
    await this.emitLoadUpdate(dto.id_crm_load, SOCKET_EVENTS.LOAD.REMOVE_CAR);
    return result;
  }

  async closeByManager(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_car_close_save',
      dto,
    );
    // Використовуємо нову константу CLOSE_CAR_BY_MANAGER
    await this.emitLoadUpdate(
      dto.id_crm_load,
      SOCKET_EVENTS.LOAD.CLOSE_CAR_BY_MANAGER,
    );
    return result;
  }

  async saveComment(dto: any, req: Request) {
    const isEditing = !!dto.id;
    const result = await this.dbservice.callProcedure(
      'crm_load_comment_save',
      dto,
    );

    // Оновлюємо лічильники на картці вантажу (використовуємо загальний UPDATE)
    await this.emitLoadUpdate(dto.id_crm_load, SOCKET_EVENTS.LOAD.UPDATE, {
      sender_id: req.user.id,
    });

    // Сповіщаємо про коментар у чаті через константи
    const chatEvent = isEditing
      ? SOCKET_EVENTS.LOAD.COMMENT_UPDATE
      : SOCKET_EVENTS.LOAD.COMMENT;
    this.loadGateway.emitToAll(chatEvent, {
      id_crm_load: dto.id_crm_load,
      comment: result[0],
      sender_id: req.user.id,
    });

    return result;
  }

  async deleteComment(commentId: number, loadId: number, req: Request) {
    const result = await this.dbservice.callProcedure(
      'crm_load_comment_delete',
      { id: commentId },
    );
    // При видаленні коментаря також оновлюємо стан вантажу (лічильники)
    await this.emitLoadUpdate(loadId, SOCKET_EVENTS.LOAD.UPDATE, {
      sender_id: req.user.id,
    });
    return result;
  }

  async setAsRead(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_comment_read_set',
      dto,
    );
    // Використовуємо константу CHAT_COUNT_UPDATE
    await this.emitLoadUpdate(
      dto.id_crm_load,
      SOCKET_EVENTS.LOAD.CHAT_COUNT_UPDATE,
    );
    return result;
  }

  async loadUpdate(dto: any) {
    const result = await this.dbservice.callProcedure('crm_load_update', {
      id: dto.id,
    });
    await this.emitLoadUpdate(dto.id, SOCKET_EVENTS.LOAD.DATE_UPDATE);
    return result;
  }

  async loadCopy(dto: any) {
    const result = await this.dbservice.callProcedure('crm_load_copy', {
      id_crm_load: dto.id,
    });
    // Для копії зазвичай підходить подія NEW або UPDATE (залежить від фільтрів фронтенду)
    await this.emitLoadUpdate(result.content.id, SOCKET_EVENTS.LOAD.NEW);
    return result;
  }

  async loadDelete(id: number) {
    const result = await this.dbservice.callProcedure('crm_load_delete', {
      id,
    });
    this.loadGateway.emitToAll(SOCKET_EVENTS.LOAD.DELETE, id);
    return result;
  }

  // --- Read Methods (без змін) ---

  async getList(query: CrmLoadListDto) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);
    return this.dbservice.callProcedure('crm_load_list', {
      pagination: { per_page: query.limit, page: query.page },
      filter: filters,
    });
  }

  async getOneLoad(id: number) {
    return this.dbservice.callProcedure('crm_load_one', { id });
  }

  async findOne(id: number) {
    return this.dbservice.callProcedure('crm_load_list', { id });
  }

  async getComments(id: any) {
    return this.dbservice.callProcedure('crm_load_comments', {
      id_crm_load: id,
    });
  }

  async cargoHistory(id: any) {
    return this.dbservice.callProcedure('crm_load_car_history', {
      id_crm_load: id,
    });
  }

  async loadHistoryDelete(dto: { id: number; table: string }) {
    const procedureName = `${dto.table}_delete`;
    return this.dbservice.callProcedure(procedureName, { id: dto.id });
  }
}
