import { Injectable } from '@nestjs/common';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class LoadService {
  public constructor(private readonly dbservice: DatabaseService) {}
  public async save(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_save',

      dto,

      {},
    );

    return result;
  }
  public async getList(dto: any) {
    const result = await this.dbservice.callProcedure(
      'crm_load_list',

      {},

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
