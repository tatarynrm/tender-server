import { Injectable } from '@nestjs/common';
import { CreateLoadDto } from './dto/create-load.dto';
import { UpdateLoadDto } from './dto/update-load.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class LoadService {
  public constructor(private readonly dbservice: DatabaseService) {}
  public async create(dto: any) {
    const object = {
      id: 1,
    };

    const result = await this.dbservice.callProcedure(
      'crm_load_one',

      object,

      {},
    );

    return result;
  }
  public async getOne(dto: any) {
    const object = {
      id: 1,
    };
    console.log('TEST');

    const result = await this.dbservice.callProcedure(
      'crm_load_one',

      object,

      {},
    );
    console.log(result, 'result data get one line 36 load service');

    return result;
  }

  findAll() {
    return `This action returns all load`;
  }

  findOne(id: number) {
    return `This action returns a #${id} load`;
  }

  update(id: number, updateLoadDto: UpdateLoadDto) {
    return `This action updates a #${id} load`;
  }

  remove(id: number) {
    return `This action removes a #${id} load`;
  }
}
