import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { TelegramRepository } from './telegram.repository';
import { TelegramGateway } from './telegram.gateway';
import { AiService } from '../ai/ai.service';
import { DatabaseOracleService } from '../database-oracle/database-oracle.service';
import { TelegramAccess } from './telegram.menu';
import { MailService } from 'src/libs/common/mail/mail.service';
import axios from 'axios';

const ADMIN_ID = 282039969;

function escapeHtmlBasic(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Результат ШІ-запиту: текст для чату + сирі рядки для PDF/Excel-звітів. */
export interface AiQueryResult {
  text: string;
  rows?: any[];
  question?: string;
  /** Формат файлу, який користувач попросив у самому запиті («звіт в Excel»). */
  reportFormat?: 'pdf' | 'xlsx';
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private readonly channelId: string;

  constructor(
    private readonly repository: TelegramRepository,
    private readonly telegramGateway: TelegramGateway,
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
    private readonly oracleService: DatabaseOracleService,
    private readonly mailService: MailService,
    @InjectBot() private readonly bot: Telegraf<any>,
  ) {
    this.channelId = this.configService.get<string>('TELEGRAM_CHANNEL_ID')!;
  }



  async onModuleInit() {
    await this.setupWebhookMode();
    await this.setupBotCommands();
  }

  private async setupBotCommands() {
    try {
      // У меню бота (кнопка "/") навмисно лишаємо тільки /start —
      // решта команд лишаються робочими, просто не показуються в списку.
      await this.bot.telegram.setMyCommands([
        { command: 'start', description: 'Запустити / Перезапустити бота' },
      ]);
      this.logger.log('✅ Команди бота успішно встановлено');
    } catch (error) {
      this.logger.error('❌ Помилка при встановленні команд бота:', error);
    }
  }

  /**
   * Персональний (chat-scoped) список команд для конкретного чату.
   * У меню Telegram навмисно лишаємо тільки /start незалежно від ролі —
   * решта команд, доступних цьому користувачу, лишаються робочими,
   * просто не підказуються в списку "/".
   */
  public async syncUserCommands(telegramId: number, access: TelegramAccess) {
    void access;
    try {
      await this.bot.telegram.setMyCommands(
        [{ command: 'start', description: 'Запустити / Перезапустити бота' }],
        { scope: { type: 'chat', chat_id: telegramId } },
      );
    } catch (error) {
      this.logger.warn(
        `Не вдалося оновити персональні команди для ${telegramId}: ${error?.message}`,
      );
    }
  }


  private async setupWebhookMode() {
    try {
      const domain = this.configService.get<string>('WEBHOOK_DOMAIN');
      if (!domain) {
        this.logger.warn(
          '⚠️ WEBHOOK_DOMAIN не задано. Бот може не отримувати оновлення.',
        );
        return;
      }

      const webhookUrl = `${domain}/telegram/webhook`;
      await this.bot.telegram.setWebhook(webhookUrl);
      this.logger.log(`✅ Webhook успішно встановлено на: ${webhookUrl}`);
    } catch (error) {
      this.logger.error('❌ Помилка при налаштуванні Webhook:', error);
    }
  }

  // --- Database Wrappers ---

  public async checkIfUserExist(telegramId: number) {
    return this.repository.findByTelegramId(telegramId);
  }

  async findByTelegramToken(token: string) {
    const row = await this.repository.findByToken(token);
    if (!row) return null;

    return {
      id: row.person_id || row.user_id,
      email: row.email,
    };
  }

  async updateTelegramId(
    personId: number,
    telegramId: number,
    username: string,
    firstName: string,
  ) {
    await this.repository.upsertTelegramUser({
      personId,
      telegramId,
      username,
      firstName,
    });
  }

  async getSubscriberStats() {
    return this.repository.getSubscriberStats();
  }

  async getTelegramUsers() {
    return this.repository.getAllTelegramUsers();
  }

  // --- Messaging ---

  async sendNewLoadToTelegramGroup(order: any) {
    const message = this.formatOrderMessage(order);

    try {
      await this.bot.telegram.sendMessage(this.channelId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚚 Відкрити заявку на порталі',
                url: `https://tender.ict.lviv.ua/log/load/active`,
              },
            ],
          ],
        },
      });
    } catch (error) {
      this.logger.error('Помилка відправки в групу:', error);
    }
  }

  async sendMessageToUser(
    personId: number,
    message: string,
    providedTelegramId?: number,
  ) {
    try {
      let telegramId = providedTelegramId;

      if (!telegramId) {
        const row = await this.repository.findByPersonId(personId);
        telegramId = row?.telegram_id;
      }

      if (telegramId) {
        await this.bot.telegram.sendMessage(telegramId, message, {
          parse_mode: 'HTML',
        });
        return true;
      }
      return false;
    } catch (err) {
      this.logger.error(
        `Failed to send TG message to person ${personId}: ${err.message}`,
      );
      return false;
    }
  }

  async broadcastMessage(payload: {
    message: string;
    filter?: { companyIds?: number[]; roles?: string[]; onlyICT?: boolean };
  }) {
    const rows = await this.repository.getSubscribersForBroadcast(
      payload.filter,
    );

    let successCount = 0;
    let failCount = 0;

    for (const row of rows) {
      try {
        await this.bot.telegram.sendMessage(row.telegram_id, payload.message, {
          parse_mode: 'HTML',
        });
        successCount++;
      } catch (err) {
        this.logger.error(
          `Broadcast failed for TG ${row.telegram_id}: ${err.message}`,
        );
        failCount++;
      }

      if (successCount % 25 === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return { total: rows.length, success: successCount, failed: failCount };
  }

  async sendMeetingNotification(payload: {
    url: string;
    audienceType: 'all' | 'heads' | 'selective';
    targetIds?: number[];
  }) {
    let telegramIds: number[] = [];

    if (payload.targetIds && payload.targetIds.length > 0) {
      const rows = await this.repository.getSubscribersByUserIds(payload.targetIds);
      telegramIds = rows.map((r) => r.telegram_id);
    } else if (payload.audienceType === 'all') {
      const rows = await this.repository.getSubscribersForBroadcast({ onlyICT: true });
      telegramIds = rows.map((r) => r.telegram_id);
    }

    if (telegramIds.length === 0) return { total: 0, success: 0, failed: 0 };

    const message = `🎥 <b>Увага! Почалася нова відео-нарада!</b>\n\n` +
                    `Заходьте на портал або переходьте за прямим посиланням:\n` +
                    `<a href="${payload.url}">${payload.url}</a>\n\n` +
                    `<i>(Ви можете також натиснути червону кнопку "Відео-нарада" у шапці CRM, як показано на фото)</i>`;

    const path = require('path');
    const photoPath = path.resolve(process.cwd(), 'assets', 'meeting_button.png');

    let successCount = 0;
    let failCount = 0;

    for (const tgId of telegramIds) {
      try {
        await this.bot.telegram.sendPhoto(
          tgId,
          { source: photoPath },
          { caption: message, parse_mode: 'HTML' }
        );
        successCount++;
      } catch (err) {
        this.logger.error(`Failed to send meeting notification to TG ${tgId}: ${err.message}`);
        failCount++;
      }

      if (successCount % 20 === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return { total: telegramIds.length, success: successCount, failed: failCount };
  }

  // --- Helpers ---

  private formatOrderMessage(order: any): string {
    const formatRoute = (routes: any[]) =>
      (routes || [])
        .sort((a, b) => a.order_num - b.order_num)
        .map((r: any) => `*${r.city}* (${r.country || r.ids_country})`)
        .join(' ➡️ ');

    const fromRoute = formatRoute(order.crm_load_route_from);
    const toRoute = formatRoute(order.crm_load_route_to);
    const trailers = (order.crm_load_trailer || [])
      .map((t: any) => t.trailer_type_name || t.ids_trailer_type)
      .join(', ');
    const priceDisplay = order.is_price_request
      ? 'Запит ціни 💰'
      : `*${order.price} ${order.ids_valut}*`;

    return [
      `👉 *${order.author || 'Користувач'}* додав нову заявку: ✅ \`${order.id}\``,
      `---`,
      `📍 *Звідки:* ${fromRoute}`,
      `🏁 *Куди:* ${toRoute}`,
      ``,
      `🚛 *Транспорт:* ${trailers}`,
      `🗓 *Дата завантаження:* ${order.date_load}`,
      `💵 *Ставка:* ${priceDisplay}`,
      ``,
      `📦 *Деталі:* ${order.is_collective ? 'Збірний вантаж' : 'Повна машина'} / ${order.transit_type || 'Регіональні'}`,
      order.load_info ? `ℹ️ *Інфо:* ${order.load_info}` : '',
      `---`,
      `🏢 *Замовник:* ${order.company_name || 'Приватна особа'}`,
      `👤 *Автор:* ${order.author || 'ID ' + order.id_usr}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  public isAdmin(telegramId: number): boolean {
    return telegramId === this.adminId();
  }

  /** ID адміна: TELEGRAM_ADMIN_ID з .env, інакше — константа. */
  private adminId(): number {
    return (
      Number(this.configService.get<string>('TELEGRAM_ADMIN_ID')) || ADMIN_ID
    );
  }

  /**
   * Надсилає службове сповіщення адміністратору (лише йому).
   * ID береться з TELEGRAM_ADMIN_ID, інакше — константа ADMIN_ID.
   */
  async notifyAdmin(
    message: string,
    extra?: Parameters<Telegraf<any>['telegram']['sendMessage']>[2],
  ): Promise<boolean> {
    const adminId = this.adminId();
    try {
      await this.bot.telegram.sendMessage(adminId, message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(extra || {}),
      });
      return true;
    } catch (err) {
      this.logger.error(`Не вдалося надіслати сповіщення адміну: ${err.message}`);
      return false;
    }
  }

  /**
   * Запускає деплой ВІД'ЄДНАНО і одразу повертає керування.
   *
   * Чекати на завершення тут не можна: останній крок скрипта — `pm2 restart all`,
   * який вбиває цей самий процес разом із ботом. Тому setsid + detached: скрипт
   * переживає рестарт, а про хід деплою звітує в Telegram сам (curl), і робить це
   * навіть тоді, коли бот уже мертвий.
   */
  public startDeploy(chatId: number, force = false): boolean {
    const script =
      this.configService.get<string>('DEPLOY_SCRIPT') || '/root/deploy.sh';

    const args = ['bash', script, String(chatId)];
    if (force) args.push('--force');

    try {
      const child = spawn('setsid', args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      this.logger.log(`Деплой запущено (${script}, chat ${chatId})`);
      return true;
    } catch (err) {
      this.logger.error(`Не вдалося запустити деплой: ${err.message}`);
      return false;
    }
  }

  /**
   * Повний рівень доступу для рольового меню бота.
   * Ролі беруться з person_role у БД, isSuperAdmin — з TELEGRAM_ADMIN_ID.
   */
  public async getAccess(telegramId: number): Promise<TelegramAccess> {
    const isSuperAdmin = this.isAdmin(telegramId);
    const profile = await this.repository.getProfileByTelegramId(telegramId);

    if (!profile) {
      return { registered: false, isIct: false, isIctAdmin: false, isSuperAdmin };
    }

    const isIct = !!profile.is_ict;
    return {
      registered: true,
      isIct,
      isIctAdmin: isIct && !!profile.is_admin,
      isSuperAdmin,
      personId: Number(profile.person_id),
      companyId: profile.company_id ? Number(profile.company_id) : undefined,
      fullName: [profile.surname, profile.name, profile.last_name]
        .filter(Boolean)
        .join(' '),
      profile,
    };
  }

  // Обгортки над репозиторієм для пунктів меню
  public getActiveTenders(limit = 10) {
    return this.repository.getActiveTenders(limit);
  }

  public getActiveTendersCount() {
    return this.repository.getActiveTendersCount();
  }

  public getCompanyRates(companyId: number, limit = 10) {
    return this.repository.getCompanyRates(companyId, limit);
  }

  public getCompanyWins(companyId: number, limit = 10) {
    return this.repository.getCompanyWins(companyId, limit);
  }

  public getIctSummary() {
    return this.repository.getIctSummary();
  }

  /** Email адміністратора з його профілю в БД (person.email). */
  public async getAdminEmail(telegramId: number): Promise<string | null> {
    const profile = await this.repository.getProfileByTelegramId(telegramId);
    return profile?.email || null;
  }

  /**
   * Відправка звіту «ШІ-Бази» на пошту адміністратора вкладенням (PDF/Excel).
   * Адреса береться з профілю — стороннім відправити неможливо.
   */
  public async sendAiReportByEmail(
    telegramId: number,
    question: string,
    fileName: string,
    fileBuffer: Buffer,
  ): Promise<string> {
    const email = await this.getAdminEmail(telegramId);
    if (!email) {
      return '❌ У вашому профілі не вказано email — не маю куди відправити звіт.';
    }

    const from = `"ICT TENDER" <${this.configService.get<string>('ICT_MAIL_SUPPORT_LOGIN')}>`;
    const html = `
      <p>Вітаю!</p>
      <p>У вкладенні — звіт «ШІ-База», сформований Telegram-ботом ICT Tender.</p>
      <p><b>Питання:</b> ${escapeHtmlBasic(question || '—')}</p>
      <p>Файл: ${escapeHtmlBasic(fileName)}</p>
    `;

    try {
      await this.mailService.sendMail(
        email,
        `Звіт ШІ-База — ${new Date().toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' })}`,
        html,
        [{ filename: fileName, content: fileBuffer }],
        'support',
        from,
      );
      return `📧 Звіт відправлено на <b>${escapeHtmlBasic(email)}</b>.`;
    } catch (err) {
      this.logger.error('Не вдалося відправити звіт ШІ-Бази на пошту:', err);
      return '❌ Не вдалося відправити лист. Перевірте налаштування пошти або спробуйте пізніше.';
    }
  }

  public async checkUserHasAiAccess(telegramId: number): Promise<boolean> {
    const roles = await this.repository.getUserRoles(telegramId);
    if (!roles) return false;
    return roles.is_admin && roles.is_ict;
  }

  public async handleAiQuery(
    telegramId: number,
    text?: string,
    voiceFileId?: string,
    targetDb?: 'postgres' | 'oracle',
    reportMode = false,
  ): Promise<AiQueryResult> {
    // 1. Check access permissions (must be both is_admin and is_ict)
    const roles = await this.repository.getUserRoles(telegramId);
    if (!roles || !roles.is_admin || !roles.is_ict) {
      return { text: '⛔️ Доступ заборонено. Тільки користувачі з ролями Адміністратора та ICT мають доступ до ШІ-Агента.' };
    }
    const userFullName = [roles.surname, roles.name, roles.last_name].filter(Boolean).join(' ');


    let voiceFile: { buffer: Buffer; mimetype: string } | undefined;

    // 2. Download voice if voiceFileId is provided
    if (voiceFileId) {
      try {
        const fileLink = await this.bot.telegram.getFileLink(voiceFileId);
        const response = await axios.get(fileLink.href, {
          responseType: 'arraybuffer',
        });
        voiceFile = {
          buffer: Buffer.from(response.data),
          mimetype: 'audio/ogg',
        };
        const transcribed = await this.aiService.transcribeVoice(voiceFile);
        if (transcribed) {
          this.logger.log(`Transcribed voice message: "${transcribed}"`);
          text = transcribed;
        }
      } catch (err) {
        this.logger.error('Failed to download or transcribe Telegram voice file:', err);
        return { text: '❌ Не вдалося завантажити голосове повідомлення. Спробуйте ще раз.' };
      }
    }

    if (!text && !voiceFile) {
      return { text: '❓ Будь ласка, введіть текстовий або запишіть голосовий запит.' };
    }

    // 3. Request Gemini to construct query
    let customSchema: string | undefined;
    if (targetDb === 'oracle') {
      try {
        const tablesList = this.oracleService.getTablesList();
        if (tablesList && tablesList.length > 0) {
          const chosenTables = await this.aiService.findOracleTables(text || 'запит', tablesList);
          if (chosenTables && chosenTables.length > 0) {
            this.logger.log(`AI identified Oracle tables: ${chosenTables.join(', ')}`);
            customSchema = await this.oracleService.getTableColumns(chosenTables);
          }
        }
      } catch (err) {
        this.logger.error('Error resolving dynamic Oracle schema:', err);
      }
    } else if (targetDb === 'postgres' && !reportMode) {
      // У режимі звітів динамічний вибір таблиць пропускаємо: звітам потрібна
      // повна статична схема з гайдом по відділах, а не вирізка з пари таблиць.
      try {
        const tablesList = this.repository.getTablesList();
        if (tablesList && tablesList.length > 0) {
          const chosenTables = await this.aiService.findPostgresTables(text || 'запит', tablesList);
          if (chosenTables && chosenTables.length > 0) {
            this.logger.log(`AI identified Postgres tables: ${chosenTables.join(', ')}`);
            customSchema = await this.repository.getTableColumns(chosenTables);
          }
        }
      } catch (err) {
        this.logger.error('Error resolving dynamic Postgres schema:', err);
      }
    }

    const result = await this.aiService.generateDbQuery(text || '', voiceFile, targetDb, customSchema, reportMode);




    if (result.type === 'conversational') {
      return { text: result.reply || 'Привіт! Чим я можу допомогти вам сьогодні?', question: text };
    }

    if (result.type === 'sql' && result.sql) {
      const sqlQuery = result.sql.trim().replace(/;\s*$/, '');

      const rejectReason = this.validateReadOnlySql(sqlQuery);
      if (rejectReason) {
        this.logger.warn(
          `Rejected unsafe generated SQL from TG User ${telegramId} (${rejectReason}): ${sqlQuery}`,
        );
        return { text: '❌ Запит відхилено з міркувань безпеки: ШІ-агенту дозволено виключно читання даних (SELECT).' };
      }

      try {
        // Виконання лише через read-only шляхи: навіть якщо валідація щось
        // пропустить, транзакція READ ONLY в самій БД запис не дасть зробити.
        let rows: any[] = [];
        if (result.database === 'oracle') {
          this.logger.log(`Executing AI generated Oracle SQL: ${sqlQuery}`);
          rows = await this.oracleService.executeReadOnlyQuery(sqlQuery);
        } else {
          this.logger.log(`Executing AI generated Postgres SQL: ${sqlQuery}`);
          rows = await this.repository.runReadOnlyQuery(sqlQuery);
        }
        
        // Format query results
        const finalAnswer = await this.aiService.formatAnswer(
          text || '(голосове повідомлення)',
          rows,
          userFullName,
        );
        return {
          text: finalAnswer,
          rows,
          question: text,
          reportFormat:
            result.report_format && result.report_format !== 'none'
              ? result.report_format
              : undefined,
        };

      } catch (dbErr) {
        this.logger.error(`Database query failed on ${result.database || 'postgres'}: ${sqlQuery}`, dbErr);
        return { text: `❌ Помилка при виконанні запиту до бази даних ${result.database === 'oracle' ? 'Oracle' : 'PostgreSQL'}.\nЛог: ${dbErr.message}` };
      }
    }


    return { text: '🤔 Не вдалося розпізнати запит або згенерувати SQL. Будь ласка, переформулюйте ваше питання.' };
  }

  /**
   * Строга перевірка SQL від ШІ: ЛИШЕ ЧИТАННЯ.
   * Повертає причину відмови або null, якщо запит безпечний.
   *
   * Це перший рубіж; другий — виконання в транзакції READ ONLY
   * (runReadOnlyQuery / executeReadOnlyQuery), де сама БД відхиляє запис.
   */
  private validateReadOnlySql(sql: string): string | null {
    const normalized = sql.trim();

    // Одна інструкція: ніяких "SELECT 1; DELETE ..."
    if (normalized.includes(';')) {
      return 'multiple statements';
    }

    // Дозволений лише SELECT (без WITH: CTE в Postgres може містити INSERT/UPDATE)
    if (!/^SELECT\b/i.test(normalized)) {
      return 'not a SELECT';
    }

    // Будь-яка мутація, DDL, керування транзакціями чи виконання коду — відмова
    const forbiddenKeywords = [
      'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UPSERT', 'REPLACE',
      'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'RENAME', 'COMMENT',
      'GRANT', 'REVOKE', 'AUDIT', 'NOAUDIT',
      'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'LOCK',
      'CALL', 'EXEC', 'EXECUTE', 'BEGIN', 'DECLARE', 'DO',
      'COPY', 'VACUUM', 'CLUSTER', 'REINDEX', 'REFRESH', 'LISTEN', 'NOTIFY',
      'SET', 'RESET', 'FLASHBACK', 'PURGE', 'INTO',
    ];
    for (const keyword of forbiddenKeywords) {
      if (new RegExp(`\\b${keyword}\\b`, 'i').test(normalized)) {
        return `forbidden keyword: ${keyword}`;
      }
    }

    // SELECT ... FOR UPDATE / FOR SHARE блокує рядки — це вже не «лише читання»
    if (/\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i.test(normalized)) {
      return 'row locking (FOR UPDATE/SHARE)';
    }

    // Функції з побічними ефектами, які формально живуть усередині SELECT
    const forbiddenFunctions = [
      'NEXTVAL', 'SETVAL', 'CURRVAL',
      'PG_SLEEP', 'PG_TERMINATE_BACKEND', 'PG_CANCEL_BACKEND', 'PG_RELOAD_CONF',
      'PG_READ_FILE', 'PG_READ_BINARY_FILE', 'PG_LS_DIR', 'PG_STAT_FILE',
      'LO_IMPORT', 'LO_EXPORT', 'DBLINK',
      'DBMS_', 'UTL_', 'SYS\\.',
    ];
    for (const fn of forbiddenFunctions) {
      if (new RegExp(`\\b${fn}`, 'i').test(normalized)) {
        return `forbidden function: ${fn}`;
      }
    }

    return null;
  }
}

