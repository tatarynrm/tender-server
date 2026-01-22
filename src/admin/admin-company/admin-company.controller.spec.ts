import { Test, TestingModule } from '@nestjs/testing';
import { AdminCompanyController } from './admin-company.controller';
import { AdminCompanyService } from './admin-company.service';

describe('AdminCompanyController', () => {
  let controller: AdminCompanyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminCompanyController],
      providers: [AdminCompanyService],
    }).compile();

    controller = module.get<AdminCompanyController>(AdminCompanyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
