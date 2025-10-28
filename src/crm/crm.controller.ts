import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CrmService } from './crm.service';

@Controller('crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('add-form-data')
  async getPreAddLoadData() {
    return this.crmService.getPreAddLoadData();
  }
}
