import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class FormDataService {
  public constructor(private readonly dbservice: DatabaseService) {}

  public async getCreateCompanyFormData() {
    const newCompany = await this.dbservice.callProcedure(
      'company_form_data',

      {},

      {},
    );

    return newCompany;
  }
}
