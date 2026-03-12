// database-oracle.controller.ts
import { Controller, Get, Query, ParseIntPipe, Param } from '@nestjs/common';
import { DatabaseOracleService } from './database-oracle.service';

@Controller('oracle')
export class DatabaseOracleController {
  constructor(private readonly oracleService: DatabaseOracleService) { }

  @Get('test')
  async getTest() {
    // Приклад виклику: схема.пакет.процедура
    return await this.oracleService.executeQuery(`function get_main_statistic(mid number) return clob is`);
  }







  @Get('data/:mid') // 1. Додаємо :mid у маршрут
  async getData(@Param('mid', ParseIntPipe) mid: number) { // 2. Вказуємо 'mid' та Pipe
    return await this.oracleService.executeProcedure(
      'p_carrier.get_main_statistic',
      { mid }
    );
  }
}