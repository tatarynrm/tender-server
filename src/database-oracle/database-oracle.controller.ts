// database-oracle.controller.ts
import { Controller, Get, Query, ParseIntPipe, Param } from '@nestjs/common';
import { DatabaseOracleService } from './database-oracle.service';

@Controller('oracle')
export class DatabaseOracleController {
  constructor(private readonly oracleService: DatabaseOracleService) { }

  @Get('test')
  async getTest() {
    // Приклад виклику: схема.пакет.процедура
    return await this.oracleService.executeQuery(
      `function get_main_statistic(mid number) return clob is`,
    );
  }
  @Get('data/:mid') // 1. Додаємо :mid у маршрут
  async getData(@Param('mid', ParseIntPipe) mid: number) {
    // 2. Вказуємо 'mid' та Pipe
    return await this.oracleService.executeProcedure(
      'p_carrier.get_main_statistic',
      { mid },
    );
  }

  @Get('carrier-statistic/:mid')
  async getCarrierStatistic(@Param('mid', ParseIntPipe) mid: number) {
    return await this.oracleService.executeProcedure(
      'p_carrier.page_main',
      { pKodPer: mid },
    );
  }

  @Get('carrier-cooperation/:mid')
  async getCarrierCooperation(@Param('mid', ParseIntPipe) mid: number) {
    return await this.oracleService.executeProcedure(
      'p_carrier.page_cooperation',
      { pKodPer: mid }, // Assuming it also takes pKodPer, or migrateid
    );
  }

  @Get('carrier-contacts/:mid')
  async getCarrierContacts(@Param('mid', ParseIntPipe) mid: number) {
    return await this.oracleService.executeProcedure(
      'p_carrier.page_contact',
      // { pKodPer: mid },
    );
  }

  @Get('search-company')
  async searchCompany(@Query('edrpou') edrpou: string) {
    if (!edrpou || edrpou.length < 8) {
      return [];
    }
    const sql = `
      select a.kod as "kod", 
             a.nur as "nur", 
             a.zkpo as "zkpo", 
             a.fo as "fo",
             (select b.nadr
               from uradr b
               where b.kod_ur = a.kod and
                     b.ur > 0 and
                     rownum < 2
               ) as "nadr"
      from ur a
      where a.zkpo like :edrpou || '%'
        and rownum <= 20
    `;
    return await this.oracleService.executeQuery(sql, { edrpou });
  }
}
