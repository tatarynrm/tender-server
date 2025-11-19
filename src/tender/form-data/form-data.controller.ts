import { Controller, Get } from '@nestjs/common';
import { FormDataService } from './form-data.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';
@Authorization()
@Controller('tender/form-data')
export class FormDataController {
  constructor(private readonly formDataService: FormDataService) {}

  @Get('getCreateTenderFormData')
  async getPreAddTenderData() {
    return this.formDataService.getPreAddTenderData();
  }
}
