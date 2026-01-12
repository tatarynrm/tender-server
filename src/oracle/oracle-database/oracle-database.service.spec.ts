import { Test, TestingModule } from '@nestjs/testing';
import { OracleDatabaseService } from './oracle-database.service';

describe('OracleDatabaseService', () => {
  let service: OracleDatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OracleDatabaseService],
    }).compile();

    service = module.get<OracleDatabaseService>(OracleDatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
