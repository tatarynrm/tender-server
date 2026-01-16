import { Controller, Get } from '@nestjs/common';
import { FormDataService } from './form-data.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Authorization()
@Controller('form-data')
export class FormDataController {
  constructor(private readonly formDataService: FormDataService) {}

  @Get('getCreateCargoFormData')
  async getPreAddCargoData() {
    return this.formDataService.getPreAddCargoData();
  }
  @Get('load-filters')
  async getLoadFormData() {
    return this.formDataService.getCrmLoadFilters();
  }

  @Get('get-currencies')
  async getCurrencies() {}
}
