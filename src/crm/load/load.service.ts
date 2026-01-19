import { Injectable } from '@nestjs/common';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { DatabaseService } from 'src/database/database.service';
import {
  buildFiltersFromQuery,
  FilterItem,
} from 'src/shared/utils/build-filters';
import { LoadGateway } from './load.gateway';

@Injectable()
export class LoadService {
  public constructor(
    private readonly dbservice: DatabaseService,
    private readonly loadGateway: LoadGateway,
  ) {}
  public async save(dto: any) {
    console.log(dto, 'DTO!!!!!!!');
    const result = await this.dbservice.callProcedure(
      'crm_load_save',

      dto,

      {},
    );
    console.log(result, 'RESULT');

    if (dto.id) {
      this.loadGateway.emitToAll('edit_load', result.content[0]);
    }
    this.loadGateway.emitToAll('new_load', result.content[0]);
    return result;
  }
  public async addCars(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_car_add_save',

      dto,

      {},
    );

    this.loadGateway.emitToAll('edit_load_car', result.content[0]);

    // this.loadGateway.emitToAll('new_load', result.content[0]);
    return result;
  }
  public async removeCars(dto: any) {
    console.log(dto, 'DTRO');

    const result = await this.dbservice.callProcedure(
      'crm_load_car_cancel_save',

      dto,

      {},
    );

    this.loadGateway.emitToAll('edit_load_car', result.content[0]);

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
  public async getList(query: any) {
    const filters: FilterItem[] = buildFiltersFromQuery(query);

    const result = await this.dbservice.callProcedure(
      'crm_load_list',

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

  public async getOneLoad(id: number) {
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
      'crm_load_one',

      { id: id },

      {},
    );

    return result;
  }

  update(id: number, updateLoadDto: UpdateLoadDto) {
    return `This action updates a #${id} load`;
  }

  remove(id: number) {
    return `This action removes a #${id} load`;
  }
}
