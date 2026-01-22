import { Test, TestingModule } from '@nestjs/testing';
import { AdminCompanyService } from './admin-company.service';

describe('AdminCompanyService', () => {
  let service: AdminCompanyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminCompanyService],
    }).compile();

    service = module.get<AdminCompanyService>(AdminCompanyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
