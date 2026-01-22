import { Controller } from '@nestjs/common';
import { AdminCompanyService } from './admin-company.service';

@Controller('admin-company')
export class AdminCompanyController {
  constructor(private readonly adminCompanyService: AdminCompanyService) {}
}
