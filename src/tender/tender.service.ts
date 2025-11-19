import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class TenderService {
  public constructor(private readonly dbservice: DatabaseService) {}

  public async getList(dto: any) {
    const result = await this.dbservice.callProcedure(
      'tender_list',

      {},

      {},
    );
    console.log(result, 'TENDERS');

    return result;
  }
  public async getOne(id: string) {
    console.log(id,'ID IN SERVICE');
    
    const result = await this.dbservice.callProcedure(
      'tender_one',

      {id:id},

      {},
    );
    console.log(result, 'TENDER ONE--------');

    return result;
  }
}
