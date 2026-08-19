// database-oracle.controller.ts
import { Controller, Get, Post, Body, Query, ParseIntPipe, Param, Logger, Inject } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import { DatabaseOracleService } from './database-oracle.service';
import { DatabaseService } from 'src/database/database.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';


@Authorization()
@Controller('oracle')
export class DatabaseOracleController {
  private readonly logger = new Logger(DatabaseOracleController.name);

  constructor(
    private readonly oracleService: DatabaseOracleService,
    private readonly databaseService: DatabaseService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClientType,
  ) { }

  /**
   * Кеш «читання-переважно» статистик у Redis. Статистики змінюються повільно,
   * а кожен виклик синхронно б'є в Oracle — тож короткий TTL (1–5 хв) різко
   * розвантажує БД. Збій Redis не ламає роут: помилки кешу лише логуються.
   */
  private async cached<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
  ): Promise<T> {
    try {
      const hit = await this.redisClient.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (e: any) {
      this.logger.warn(`Кеш-читання ${key} впало: ${e?.message}`);
    }
    const value = await producer();
    try {
      await this.redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch (e: any) {
      this.logger.warn(`Кеш-запис ${key} впав: ${e?.message}`);
    }
    return value;
  }

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
  async getCarrierStatistic(
    @Param('mid', ParseIntPipe) mid: number,
    @Query() query: any,
  ) {
    return this.cached(`oracle:carrier-statistic:${mid}`, 120, async () => {
      const result = await this.oracleService.executeProcedure<any>(
        'p_carrier.run',
        { func: 'main', kod_per: mid, body: JSON.stringify(query || {}) },
      );

      // Статистика по тендерах живе в Postgres, а не в Oracle — доклеюємо її
      // до оракловського content окремим полем tender_statistic. Виклик
      // відмовостійкий навмисне: збій процедури не повинен класти весь екран
      // статистики перевізника, фронт трактує null як нулі.
      let tenderStatistic: any = null;
      try {
        const tenderResult =
          await this.databaseService.callProcedure('tender_statistic', {}, {});
        tenderStatistic = tenderResult?.content ?? null;
      } catch (error: any) {
        this.logger.warn(`tender_statistic недоступна: ${error?.message}`);
      }

      const content = result?.content ?? result;

      return { ...(content || {}), tender_statistic: tenderStatistic };
    });
  }

  @Get('carrier-cooperation/:mid')
  async getCarrierCooperation(
    @Param('mid', ParseIntPipe) mid: number,
    @Query() query: any,
  ) {
    return this.cached(`oracle:carrier-cooperation:${mid}`, 300, async () => {
      const result = await this.oracleService.executeProcedure<any>(
        'p_carrier.run',
        { func: 'cooperation', kod_per: mid, body: JSON.stringify(query || {}) },
      );
      return result?.content || result;
    });
  }

  @Get('carrier-contacts/:mid')
  async getCarrierContacts(
    @Param('mid', ParseIntPipe) mid: number,
    @Query() query: any,
  ) {
    return this.cached(`oracle:carrier-contacts:${mid}`, 300, async () => {
      const result = await this.oracleService.executeProcedure<any>(
        'p_carrier.run',
        { func: 'contact_list_ict', kod_per: mid, body: JSON.stringify(query || {}) },
      );
      return result?.content || result;
    });
  }

  @Get('carrier-transportations/:mid')
  async getCarrierTransportations(
    @Param('mid', ParseIntPipe) mid: number,
    @Query() query: any,
  ) {
    return this.cached(`oracle:carrier-transportations:${mid}`, 120, async () => {
      const result = await this.oracleService.executeProcedure<any>(
        'p_carrier.run',
        { func: 'perev_statistic', kod_per: mid, body: JSON.stringify(query || {}) },
      );
      return result?.content || result;
    });
  }

  @Post('carrier-transportation-list/:mid')
  async getCarrierTransportationList(
    @Param('mid', ParseIntPipe) mid: number,
    @Body() body: any,
  ) {
    const result = await this.oracleService.executeProcedure<any>(
      'p_carrier.run',
      { func: 'perev_list', kod_per: mid, body: JSON.stringify(body || {}) },
    );
    // Віддаємо повну відповідь разом із props.pagination — вона потрібна
    // вкладці «Невиставлені рахунки». Споживачі, яким треба лише масив,
    // розпаковують content самі (carrier-statistic.service.ts).
    return result;
  }

  @Post('carrier-transportation-filter/:mid')
  async getCarrierTransportationFilter(
    @Param('mid', ParseIntPipe) mid: number,
    @Body() body: any,
  ) {
    const result = await this.oracleService.executeProcedure<any>(
      'p_carrier.run',
      { func: 'perev_filter', kod_per: mid, body: JSON.stringify(body || {}) },
    );
    // Повна відповідь разом із props.pagination — вкладка «Пошук» рахує
    // з неї кількість сторінок. Масив лежить у content.
    return result;
  }

  @Post('carrier-transportation/:mid')
  async getCarrierTransportation(
    @Param('mid', ParseIntPipe) mid: number,
    @Body() body: any,
  ) {
    const result = await this.oracleService.executeProcedure<any>(
      'p_carrier.run',
      { func: 'perev_one', kod_per: mid, body: JSON.stringify(body || {}) },
    );
    return result?.content || result;
  }

  @Get('client-orders-statistic/:mid')
  async getClientOrdersStatistic(
    @Param('mid', ParseIntPipe) mid: number,
    @Query() query: any,
  ) {
    return this.cached(`oracle:client-orders-statistic:${mid}`, 180, async () => {
      const result = await this.oracleService.executeProcedure<any>(
        'p_carrier.run',
        { func: 'zay_statistic', kod_per: mid, body: JSON.stringify(query || {}) },
      );
      return result?.content || result;
    });
  }

  @Post('client-orders-list/:mid')
  async getClientOrdersList(
    @Param('mid', ParseIntPipe) mid: number,
    @Body() body: any,
  ) {
    const result = await this.oracleService.executeProcedure<any>(
      'p_carrier.run',
      { func: 'zay_list', kod_per: mid, body: JSON.stringify(body || {}) },
    );
    return result?.content || result;
  }

  @Get('customer-trips/:kodZam')
  async getCustomerTrips(
    @Param('kodZam') kodZam: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.oracleService.getCustomerTrips(
      kodZam,
      Number(page) || 1,
      Number(perPage) || 10,
    );
  }

  @Get('carrier-finance-statistic/:mid')
  async getCarrierFinanceStatistic(
    @Param('mid', ParseIntPipe) mid: number,
    @Query() query: any,
  ) {
    return this.cached(`oracle:carrier-finance-statistic:${mid}`, 180, async () => {
      const result = await this.oracleService.executeProcedure<any>(
        'p_carrier.run',
        { func: 'rah_statistic', kod_per: mid, body: JSON.stringify(query || {}) },
      );
      return result;
    });
  }

  @Post('carrier-finance-list/:mid')
  async getCarrierFinanceList(
    @Param('mid', ParseIntPipe) mid: number,
    @Body() body: any,
  ) {
    const result = await this.oracleService.executeProcedure<any>(
      'p_carrier.run',
      { func: 'rah_list', kod_per: mid, body: JSON.stringify(body || {}) },
    );
    return result;
  }

  // Пошук рахунків за фільтрами (вкладка «Пошук» у фінансах) — аналог
  // carrier-transportation-filter, лише інша функція процедури. Body прозоро
  // прокидається у p_carrier.run (func: rah_filter): { filter, pagination }.
  // Повна відповідь разом із props.pagination — фронт рахує з неї сторінки.
  @Post('carrier-finance-filter/:mid')
  async getCarrierFinanceFilter(
    @Param('mid', ParseIntPipe) mid: number,
    @Body() body: any,
  ) {
    const result = await this.oracleService.executeProcedure<any>(
      'p_carrier.run',
      { func: 'rah_filter', kod_per: mid, body: JSON.stringify(body || {}) },
    );
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // публічний + б'є в Oracle
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
