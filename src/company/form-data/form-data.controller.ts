import { Controller, Get } from '@nestjs/common';
import { FormDataService } from './form-data.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';
@Authorization()
@Controller('company/form-data')
export class FormDataController {
  constructor(private readonly companyFormService: FormDataService) {}

  @Get('create')
  async getCreateCompanyFormData() {
    // query тепер містить всі ваші фільтри та пагінацію
    return this.companyFormService.getCreateCompanyFormData();
  }
}
