import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { UserGateway } from 'src/user/user.gateway';

@Injectable()
export class TenderService {
  public constructor(
    private readonly dbservice: DatabaseService,
    private readonly userGateway: UserGateway,
  ) {}

  public async getList(dto: any) {
    const result = await this.dbservice.callProcedure(
      'tender_list',

      {},

      {},
    );
    console.log(result, 'TENDERS');

    return result;
  }
  public async getClientList() {
    const result = await this.dbservice.callProcedure(
      'tender_list_client',

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
    console.log(result, 'TENDERS');

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

 

    this.userGateway.emitToAll('new_bid', result.content[0]);
    return result;
  }
}
