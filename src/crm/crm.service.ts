import { Injectable } from '@nestjs/common';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { DatabaseService } from 'src/database/database.service';

@Authorization()
@Injectable()
export class CrmService {
  public constructor(private readonly dbService: DatabaseService) {}

  public async getPreAddLoadData() {
    const result = await this.dbService.callProcedure(
      'crm_load_form_data',

      {},

      {},
    );

    return result;
  }
}
