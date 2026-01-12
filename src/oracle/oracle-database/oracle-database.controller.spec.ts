import { Test, TestingModule } from '@nestjs/testing';
import { OracleDatabaseController } from './oracle-database.controller';
import { OracleDatabaseService } from './oracle-database.service';

describe('OracleDatabaseController', () => {
  let controller: OracleDatabaseController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OracleDatabaseController],
      providers: [OracleDatabaseService],
    }).compile();

    controller = module.get<OracleDatabaseController>(OracleDatabaseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
