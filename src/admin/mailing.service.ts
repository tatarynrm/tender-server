import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { MailService } from 'src/libs/common/mail/mail.service';
import { UserGateway } from 'src/user/user.gateway';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export interface MailingJobState {
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED';
  emailTitle: string;
  emailContent: string;
  templateIds: string;
  total: number;
  processed: number;
}

@Injectable()
export class MailingService implements OnModuleInit {
  // In-memory registry of running jobs
  private runningJobs = new Map<number, MailingJobState>();

  constructor(
    private readonly dbservice: DatabaseService,
    private readonly mailService: MailService,
    private readonly userGateway: UserGateway,
    @InjectQueue('email-mailing') private readonly emailQueue: Queue,
  ) { }

  async onModuleInit() {
    await this.initDatabase();
  }

  private async initDatabase() {
    // Database modifications removed as per request to not change DB structure
  }

  getRunningJob(id: number): MailingJobState | undefined {
    return this.runningJobs.get(id);
  }

  removeRunningJob(id: number) {
    this.runningJobs.delete(id);
  }

  emitCompleted(id: number) {
    this.userGateway.emitToAll('mailing_completed', { mailingId: id });
  }

  /**
   * Creates a new mailing content entry and parses emails from an uploaded Excel file
   */
  async createMailing(itemName: string, fileBuffer?: Buffer) {
    if (!itemName) {
      throw new BadRequestException('Назва розсилки обов’язкова');
    }

    let emails: string[] = [];

    if (fileBuffer && fileBuffer.length > 0) {
      try {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        const emailSet = new Set<string>();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        for (const row of rows) {
          if (Array.isArray(row)) {
            for (const cell of row) {
              if (cell && typeof cell === 'string') {
                const cleaned = cell.trim().toLowerCase();
                if (emailRegex.test(cleaned)) {
                  emailSet.add(cleaned);
                }
              }
            }
          }
        }
        emails = Array.from(emailSet);
      } catch (excelError) {
        throw new BadRequestException(`Не вдалося розпарсити Excel файл: ${excelError.message}`);
      }

      if (emails.length === 0) {
        throw new BadRequestException('У файлі не знайдено жодної коректної адреси електронної пошти');
      }
    }

    // Insert mailing_content
    const contentResult = await this.dbservice.query(
      'INSERT INTO mailing_content (item_name) VALUES ($1) RETURNING id',
      [itemName]
    );
    const mailingId = Number(contentResult.rows[0].id);

    // Insert addresses inside a database transaction
    const client = await this.dbservice.getClient();
    try {
      await client.query('BEGIN');
      for (const email of emails) {
        await client.query(
          'INSERT INTO mailing_address (email, id_content, ids_status, created_at) VALUES ($1, $2, $3, NOW())',
          [email, mailingId, 'PENDING']
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new BadRequestException(`Помилка під час збереження адрес: ${err.message}`);
    } finally {
      client.release();
    }

    return {
      status: 'ok',
      mailingId,
      itemName,
      totalAddresses: emails.length,
    };
  }

  /**
   * Returns a list of all mailings with aggregated stats (paginated)
   */
  async getMailingsList(page = 1, limit = 10, search = '') {
    // 1. Build search condition
    let searchCond = '';
    const queryParams: any[] = [];
    if (search && search.trim() !== '') {
      searchCond = 'WHERE item_name ILIKE $1';
      queryParams.push(`%${search.trim()}%`);
    }

    // 2. Count total records
    const countQuery = `
      SELECT COUNT(id) as count 
      FROM mailing_content 
      ${searchCond}
    `;
    const countResult = await this.dbservice.query(countQuery, queryParams);
    const totalCount = Number(countResult.rows[0].count);

    // 3. Paginated query
    const offset = (page - 1) * limit;

    // Copy queryParams
    const fetchParams = [...queryParams];
    const limitIndex = fetchParams.push(limit);
    const offsetIndex = fetchParams.push(offset);

    const query = `
      SELECT 
        mc.id, 
        mc.item_name,
        mc.email_title,
        mc.email_content,
        mc.template_ids,
        mc.created_at,
        COUNT(ma.id) as total,
        COUNT(ma.id) FILTER (WHERE ma.ids_status = 'PENDING') as pending,
        COUNT(ma.id) FILTER (WHERE ma.ids_status = 'PROCESSING') as processing,
        COUNT(ma.id) FILTER (WHERE ma.ids_status = 'DONE') as done,
        COUNT(ma.id) FILTER (WHERE ma.ids_status = 'FAILED') as failed
      FROM (
        SELECT id, item_name, email_title, email_content, template_ids, created_at
        FROM mailing_content
        ${searchCond}
        ORDER BY id DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      ) mc
      LEFT JOIN mailing_address ma ON mc.id = ma.id_content
      GROUP BY mc.id, mc.item_name, mc.email_title, mc.email_content, mc.template_ids, mc.created_at
      ORDER BY mc.id DESC
    `;

    const result = await this.dbservice.query(query, fetchParams);

    const data = result.rows.map(row => {
      const id = Number(row.id);
      const pending = Number(row.pending);
      const processing = Number(row.processing);
      const done = Number(row.done);
      const failed = Number(row.failed);
      const total = Number(row.total);

      // In-memory status override if running
      let status = 'IDLE';
      const runningJob = this.runningJobs.get(id);
      if (runningJob) {
        status = runningJob.status;
      } else if (pending === 0 && processing === 0 && total > 0) {
        status = 'COMPLETED';
      } else if (done > 0 || failed > 0) {
        status = 'PAUSED';
      }

      return {
        id,
        item_name: row.item_name,
        email_title: row.email_title,
        email_content: row.email_content,
        template_ids: row.template_ids || 'plain',
        created_at: row.created_at || new Date().toISOString(),
        stats: { total, pending, processing, done, failed },
        status,
      };
    });

    return {
      data,
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  /**
   * Returns stats and detailed list of addresses for a specific mailing
   */
  async getMailingDetails(id: number, page = 1, limit = 50, search = '') {
    const contentResult = await this.dbservice.query(
      'SELECT id, item_name, email_title, email_content, template_ids FROM mailing_content WHERE id = $1',
      [id]
    );
    if (contentResult.rows.length === 0) {
      throw new NotFoundException('Розсилку не знайдено');
    }
    const mailing = contentResult.rows[0];

    // Compute basic campaign stats across ALL addresses (independent of search/page!)
    const statsQuery = `
      SELECT 
        COUNT(id) as total,
        COUNT(id) FILTER (WHERE ids_status = 'PENDING') as pending,
        COUNT(id) FILTER (WHERE ids_status = 'PROCESSING') as processing,
        COUNT(id) FILTER (WHERE ids_status = 'DONE') as done,
        COUNT(id) FILTER (WHERE ids_status = 'FAILED') as failed
      FROM mailing_address
      WHERE id_content = $1
    `;
    const statsResult = await this.dbservice.query(statsQuery, [id]);
    const total = Number(statsResult.rows[0].total);
    const pending = Number(statsResult.rows[0].pending);
    const processing = Number(statsResult.rows[0].processing);
    const done = Number(statsResult.rows[0].done);
    const failed = Number(statsResult.rows[0].failed);

    // Compute paginated address list
    let searchCond = '';
    const queryParams: any[] = [id];

    if (search && search.trim() !== '') {
      searchCond = 'AND email ILIKE $2';
      queryParams.push(`%${search.trim()}%`);
    }

    const countQuery = `
      SELECT COUNT(id) as count 
      FROM mailing_address 
      WHERE id_content = $1 ${searchCond}
    `;
    const countResult = await this.dbservice.query(countQuery, queryParams);
    const totalFiltered = Number(countResult.rows[0].count);

    // Fetch the specific page
    const offset = (page - 1) * limit;

    // Add limit and offset parameters
    const fetchParams = [...queryParams];
    const limitIndex = fetchParams.push(limit);
    const offsetIndex = fetchParams.push(offset);

    const addressesQuery = `
      SELECT id, email, ids_status, created_at 
      FROM mailing_address 
      WHERE id_content = $1 ${searchCond}
      ORDER BY id ASC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;
    const addressesResult = await this.dbservice.query(addressesQuery, fetchParams);

    const addressesData = addressesResult.rows.map(row => ({
      id: Number(row.id),
      email: row.email,
      ids_status: row.ids_status,
      created_at: row.created_at,
    }));

    let status = 'IDLE';
    const runningJob = this.runningJobs.get(id);
    if (runningJob) {
      status = runningJob.status;
    } else if (pending === 0 && processing === 0 && total > 0) {
      status = 'COMPLETED';
    } else if (done > 0 || failed > 0) {
      status = 'PAUSED';
    }

    // Scan attachments on disk
    let attachments: Array<{ name: string; size: number }> = [];
    try {
      const dirPath = path.join(process.cwd(), 'uploads', 'mailings', String(id));
      if (fs.existsSync(dirPath)) {
        const fileNames = fs.readdirSync(dirPath);
        attachments = fileNames.map(name => {
          const filePath = path.join(dirPath, name);
          const stats = fs.statSync(filePath);
          return {
            name,
            size: stats.size,
          };
        });
      }
    } catch (fsErr) {
      console.error('Failed to load attachments stats from disk:', fsErr.message);
    }

    return {
      id: Number(mailing.id),
      item_name: mailing.item_name,
      email_title: mailing.email_title,
      email_content: mailing.email_content,
      template_ids: mailing.template_ids || 'plain',
      status,
      stats: { total, pending, processing, done, failed },
      attachments,
      addresses: {
        data: addressesData,
        meta: {
          total: totalFiltered,
          page,
          limit,
          totalPages: Math.ceil(totalFiltered / limit),
        },
      },
    };
  }

  /**
   * Deletes a mailing campaign completely (from db tables and file system)
   */
  async deleteMailing(id: number) {
    const runningJob = this.runningJobs.get(id);
    if (runningJob && runningJob.status === 'RUNNING') {
      throw new BadRequestException('Неможливо видалити активну розсилку. Спочатку призупиніть її.');
    }

    await this.dbservice.query('BEGIN');
    try {
      await this.dbservice.query('DELETE FROM mailing_address WHERE id_content = $1', [id]);
      await this.dbservice.query('DELETE FROM mailing_content WHERE id = $1', [id]);
      await this.dbservice.query('COMMIT');
    } catch (error) {
      await this.dbservice.query('ROLLBACK');
      throw error;
    }

    // Clean up uploaded files on disk
    try {
      const dirPath = path.join(process.cwd(), 'uploads', 'mailings', String(id));
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch (fsErr) {
      console.error('Failed to clean up attachments on delete:', fsErr.message);
    }

    this.runningJobs.delete(id);

    return { status: 'ok' };
  }

  /**
   * Deletes multiple mailing campaigns
   */
  async deleteMailingsBulk(ids: number[]) {
    if (!ids || ids.length === 0) return { status: 'ok' };

    for (const id of ids) {
      const runningJob = this.runningJobs.get(id);
      if (runningJob && runningJob.status === 'RUNNING') {
        throw new BadRequestException(`Неможливо видалити активну розсилку (ID: ${id}). Спочатку призупиніть її.`);
      }
    }

    await this.dbservice.query('BEGIN');
    try {
      // Delete in batches or use ANY/IN operator
      const idsStr = ids.join(',');
      await this.dbservice.query(`DELETE FROM mailing_address WHERE id_content IN (${idsStr})`);
      await this.dbservice.query(`DELETE FROM mailing_content WHERE id IN (${idsStr})`);
      await this.dbservice.query('COMMIT');
    } catch (error) {
      await this.dbservice.query('ROLLBACK');
      throw error;
    }

    for (const id of ids) {
      try {
        const dirPath = path.join(process.cwd(), 'uploads', 'mailings', String(id));
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } catch (fsErr) {
        console.error(`Failed to clean up attachments on delete for id ${id}:`, fsErr.message);
      }
      this.runningJobs.delete(id);
    }

    return { status: 'ok', count: ids.length };
  }

  /**
   * Upload addresses from excel to an existing campaign
   */
  async uploadAddressesFromExcel(id: number, fileBuffer: Buffer | undefined, mode: 'append' | 'replace') {
    if (!fileBuffer) {
      throw new BadRequestException('Файл не знайдено');
    }

    const runningJob = this.runningJobs.get(id);
    if (runningJob && runningJob.status === 'RUNNING') {
      throw new BadRequestException('Неможливо змінити адреси під час активної відправки. Призупиніть розсилку.');
    }

    // Parse emails from excel
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1 });

    const emails = new Set<string>();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const row of rawData) {
      for (const cell of row) {
        if (typeof cell === 'string') {
          const cleaned = cell.trim().toLowerCase();
          if (emailRegex.test(cleaned)) {
            emails.add(cleaned);
          }
        }
      }
    }

    if (emails.size === 0) {
      throw new BadRequestException('У файлі не знайдено валідних email адрес');
    }

    await this.dbservice.query('BEGIN');
    try {
      if (mode === 'replace') {
        // Delete only PENDING emails. If some were already sent, we shouldn't touch them or delete history.
        await this.dbservice.query(
          "DELETE FROM mailing_address WHERE id_content = $1 AND ids_status = 'PENDING'",
          [id]
        );
      }

      // Insert new emails
      for (const email of emails) {
        // We use ON CONFLICT DO NOTHING if we create a unique constraint, but since there might not be one,
        // we manually check if it exists or just insert blindly. The mailing_address table structure allows duplicates 
        // if no constraint exists. To be safe, we insert all.
        await this.dbservice.query(
          `INSERT INTO mailing_address (id_content, email, ids_status) VALUES ($1, $2, 'PENDING')`,
          [id, email]
        );
      }

      await this.dbservice.query('COMMIT');
    } catch (e) {
      await this.dbservice.query('ROLLBACK');
      throw new BadRequestException('Помилка бази даних при збереженні адрес: ' + e.message);
    }

    return {
      status: 'ok',
      message: 'Адреси успішно завантажено',
      addedCount: emails.size
    };
  }

  /**
   * Starts or resumes a mailing campaign
   */
  async startMailing(
    id: number,
    emailTitle: string,
    emailContent: string,
    templateIds = 'plain',
    files?: Express.Multer.File[],
  ) {
    if (!emailTitle) {
      throw new BadRequestException('Тема листа обов’язкова');
    }
    if (!emailContent) {
      throw new BadRequestException('Текст повідомлення обов’язковий');
    }

    const details = await this.getMailingDetails(id);
    if (details.status === 'RUNNING') {
      throw new BadRequestException('Розсилку вже запущена та виконується');
    }
    if (details.stats.pending === 0 && details.stats.processing === 0) {
      throw new BadRequestException('Усі листи для цієї розсилки вже надіслано');
    }

    // Save title, content, and templateIds to database
    await this.dbservice.query(
      'UPDATE mailing_content SET email_title = $1, email_content = $2, template_ids = $3 WHERE id = $4',
      [emailTitle, emailContent, templateIds, id]
    );

    // Save files to disk under uploads/mailings/${id}/
    if (files && files.length > 0) {
      const dirPath = path.join(process.cwd(), 'uploads', 'mailings', String(id));

      // Ensure directory exists
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      } else {
        // Clear old files
        const existingFiles = fs.readdirSync(dirPath);
        for (const f of existingFiles) {
          try {
            fs.unlinkSync(path.join(dirPath, f));
          } catch (e) {
            console.error('Failed to unlink existing attachment file:', e.message);
          }
        }
      }

      // Write files
      for (const file of files) {
        fs.writeFileSync(path.join(dirPath, file.originalname), file.buffer);
      }
    }

    // Reset stuck PROCESSING items to PENDING
    await this.dbservice.query(
      "UPDATE mailing_address SET ids_status = 'PENDING' WHERE id_content = $1 AND ids_status = 'PROCESSING'",
      [id]
    );

    // Get fresh list of PENDING addresses
    const pendingResult = await this.dbservice.query(
      "SELECT id, email FROM mailing_address WHERE id_content = $1 AND ids_status = 'PENDING' ORDER BY id ASC",
      [id]
    );
    const pendingEmails = pendingResult.rows.map(row => ({
      id: Number(row.id),
      email: row.email,
    }));

    // Register job state in memory
    const jobState: MailingJobState = {
      status: 'RUNNING',
      emailTitle,
      emailContent,
      templateIds: templateIds,
      total: details.stats.total,
      processed: details.stats.done + details.stats.failed,
    };
    this.runningJobs.set(id, jobState);

    // Enqueue jobs to BullMQ in bulk
    const jobs = pendingEmails.map(item => ({
      name: 'send-individual-email',
      data: {
        mailingId: id,
        addressId: item.id,
        email: item.email,
        title: emailTitle,
        content: emailContent,
        templateIds: templateIds,
      },
      opts: {
        jobId: `mail-${id}-addr-${item.id}`, // De-duplication
      },
    }));

    // Resume the queue if paused
    await this.emailQueue.resume();

    // Add jobs bulk
    await this.emailQueue.addBulk(jobs);

    // Broadcast instant socket status change
    await this.broadcastUpdate(id);

    return {
      status: 'ok',
      message: 'Розсилку запущено',
      stats: {
        total: details.stats.total,
        pending: pendingEmails.length,
      },
    };
  }

  /**
   * Pauses an active mailing campaign
   */
  async pauseMailing(id: number) {
    const job = this.runningJobs.get(id);
    if (!job || job.status !== 'RUNNING') {
      throw new BadRequestException('Розсилка не є активною в даний момент');
    }

    job.status = 'PAUSED';

    // Pause the BullMQ queue globally so workers pause picking up jobs
    await this.emailQueue.pause();

    await this.broadcastUpdate(id);

    return {
      status: 'ok',
      message: 'Розсилку призупинено',
    };
  }

  /**
   * Broadcasts the updated stats of a mailing to all connected admin clients via Sockets
   */
  async broadcastUpdate(mailingId: number) {
    try {
      const details = await this.getMailingDetails(mailingId);
      this.userGateway.emitToAll('mailing_progress', {
        mailingId,
        itemName: details.item_name,
        status: details.status,
        stats: details.stats,
      });
    } catch (e) {
      console.error('Socket progress broadcast error:', e.message);
    }
  }

  /**
   * Compiles HTML template with given content and title
   */
  compileTemplate(templateIds: string, content: string, title: string): string {
    const year = new Date().getFullYear();
    switch (templateIds) {
      case 'adaptive':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>:root { color-scheme: light dark; } @media (prefers-color-scheme: dark) { body, .container { background-color: #0f172a !important; color: #f8fafc !important; } .container { border-color: #334155 !important; } h1, h2, p, span, div { color: #f8fafc !important; } hr { border-top-color: #334155 !important; } .footer p { color: #94a3b8 !important; } }</style></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; background-color: #f1f5f9; margin: 0; padding: 20px;"><div class="container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; line-height: 1.6;"><h2 style="margin-top: 0;">${title}</h2>${content}<hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 25px; margin-bottom: 20px;"><div class="footer"><p style="font-size: 11px; color: #64748b; text-align: center; margin: 0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'plain':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 16px; border: 1px solid #e2e8f0; line-height: 1.6;"><h2>${title}</h2>${content}<hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 30px; margin-bottom: 20px;"><p style="font-size: 11px; color: #94a3b8; text-align: center;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></body></html>`;
      case 'corporate':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;"><div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); background-color: #1e3a8a; padding: 40px 30px; text-align: center; color: #ffffff;"><h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${title}</h1></div><div style="padding: 40px 30px; line-height: 1.7; font-size: 15px;">${content}</div><div style="background-color: #f8fafc; padding: 24px 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;"><p style="margin:0 0 10px 0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'newsletter':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; background-color: #fafafa; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid #f1f5f9;"><div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); background-color: #0f172a; padding: 50px 40px; color: #ffffff;"><div style="display: inline-block; background-color: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px;">Новини та Оновлення</div><h1 style="margin: 0; font-size: 28px; font-weight: 800; line-height: 1.2;">${title}</h1></div><div style="padding: 40px; line-height: 1.8; font-size: 15px;">${content}</div><div style="background-color: #0f172a; padding: 30px; text-align: center; font-size: 11px; color: #94a3b8;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'minimal':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #2c3e50; background-color: #fdfbf7; margin: 0; padding: 50px 20px;"><div style="max-width: 580px; margin: 0 auto; padding: 20px;"><h2 style="font-size: 22px; font-weight: 600; color: #1a252f; margin-bottom: 24px; border-left: 3px solid #d4af37; padding-left: 12px;">${title}</h2><div style="line-height: 1.6; font-size: 15px; color: #34495e; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">${content}</div><div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1ece4; font-size: 12px; color: #95a5a6; text-align: center;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'tech':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Segoe UI', sans-serif; color: #cbd5e1; background-color: #0f172a; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden;"><div style="padding: 30px; border-bottom: 1px solid #334155;"><h1 style="margin: 0; font-size: 24px; color: #f8fafc; font-weight: 700;"><span style="color: #6366f1; margin-right: 10px;">&gt;</span>${title}</h1></div><div style="padding: 30px; line-height: 1.6; font-size: 14px;">${content}</div><div style="padding: 20px 30px; background-color: #0b1120; font-size: 11px; text-align: center; color: #64748b;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'eco':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Arial, sans-serif; color: #3f614a; background-color: #f0f8f4; margin: 0; padding: 30px 15px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 2px solid #e0efe6; overflow: hidden;"><div style="background-color: #d1e8db; padding: 30px; text-align: center;"><h1 style="margin: 0; font-size: 22px; color: #1f402c;">🌿 ${title}</h1></div><div style="padding: 30px; line-height: 1.6; font-size: 15px;">${content}</div><div style="background-color: #e0efe6; padding: 20px; text-align: center; font-size: 11px; color: #5a7d67;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'alert':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Segoe UI', sans-serif; color: #1f2937; background-color: #fdf2f2; margin: 0; padding: 30px 15px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border-left: 6px solid #e11d48; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); overflow: hidden;"><div style="padding: 20px 30px; background-color: #fff1f2; border-bottom: 1px solid #ffe4e6;"><h1 style="margin: 0; font-size: 22px; color: #be123c;">⚠️ ${title}</h1></div><div style="padding: 30px; line-height: 1.6; font-size: 15px;">${content}</div><div style="padding: 15px 30px; background-color: #f9fafb; border-top: 1px solid #f3f4f6; text-align: center; font-size: 11px; color: #6b7280;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'elegant':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Times New Roman', serif; color: #000000; background-color: #ffffff; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; border: 1px solid #000000; padding: 40px;"><div style="text-align: center; border-bottom: 2px solid #000000; padding-bottom: 20px; margin-bottom: 30px;"><h1 style="margin: 0; font-size: 28px; font-weight: normal; letter-spacing: 2px; text-transform: uppercase;">${title}</h1></div><div style="line-height: 1.8; font-size: 16px;">${content}</div><div style="margin-top: 40px; border-top: 1px solid #e5e5e5; padding-top: 20px; text-align: center; font-size: 11px; font-family: Arial, sans-serif; color: #666666;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'creative':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1f2937; background-color: #fdf4ff; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 30px; overflow: hidden; box-shadow: 0 10px 25px rgba(217, 70, 239, 0.1);"><div style="background: linear-gradient(135deg, #d946ef 0%, #8b5cf6 100%); background-color: #d946ef; padding: 50px 30px; text-align: center; color: #ffffff;"><h1 style="margin: 0; font-size: 26px; font-weight: 900;">${title}</h1></div><div style="padding: 40px 30px; line-height: 1.7; font-size: 15px;">${content}</div><div style="background-color: #fdf4ff; padding: 20px; text-align: center; font-size: 12px; color: #c026d3;"><p style="margin:0;">✨ © ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'medical':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #334155; background-color: #ecfeff; margin: 0; padding: 30px 15px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border-top: 4px solid #06b6d4; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);"><div style="padding: 30px 30px 10px;"><h1 style="margin: 0; font-size: 24px; color: #0891b2; font-weight: 600;">${title}</h1></div><div style="padding: 20px 30px 40px; line-height: 1.6; font-size: 15px;">${content}</div><div style="background-color: #f8fafc; padding: 15px 30px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'education':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: Georgia, serif; color: #333333; background-color: #f4f7f9; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #c8d8e4;"><div style="background-color: #034f84; padding: 35px 30px; text-align: center; border-bottom: 4px solid #f7cac9;"><h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: normal;">${title}</h1></div><div style="padding: 40px 30px; line-height: 1.8; font-size: 16px;">${content}</div><div style="background-color: #f4f7f9; padding: 20px; text-align: center; font-size: 11px; font-family: Arial, sans-serif; color: #777777; border-top: 1px solid #c8d8e4;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'finance':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #111827; background-color: #f3f4f6; margin: 0; padding: 30px 15px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 4px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);"><div style="padding: 30px; border-bottom: 2px solid #0f766e; background-color: #f8fafc; border-radius: 4px 4px 0 0;"><h1 style="margin: 0; font-size: 22px; color: #0f766e;">${title}</h1></div><div style="padding: 30px; line-height: 1.6; font-size: 14px;">${content}</div><div style="padding: 20px 30px; background-color: #111827; color: #9ca3af; font-size: 11px; text-align: center; border-radius: 0 0 4px 4px;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'realestate':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #3e3e3e; background-color: #ece8e1; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;"><div style="background-color: #1c3d5a; padding: 40px 30px; text-align: center;"><h1 style="margin: 0; font-size: 26px; color: #fdfbf7; font-weight: 300; letter-spacing: 1px;">${title}</h1></div><div style="padding: 40px 30px; line-height: 1.6; font-size: 15px;">${content}</div><div style="background-color: #f3f0ea; padding: 25px 30px; text-align: center; font-size: 12px; color: #827e77;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'holiday':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', sans-serif; color: #0f172a; background-color: #e0f2fe; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 4px solid #bae6fd; overflow: hidden;"><div style="background-color: #38bdf8; padding: 30px; text-align: center; color: #ffffff;"><h1 style="margin: 0; font-size: 28px;">❄️ ${title} ❄️</h1></div><div style="padding: 30px; line-height: 1.6; font-size: 15px;">${content}</div><div style="background-color: #f0f9ff; padding: 15px; text-align: center; font-size: 12px; color: #0284c7;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'summer':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #422006; background-color: #fef08a; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; box-shadow: 0 8px 20px rgba(234, 179, 8, 0.3); overflow: hidden;"><div style="background-color: #facc15; padding: 35px 30px; text-align: center;"><h1 style="margin: 0; font-size: 26px; color: #713f12; font-weight: 800;">☀️ ${title}</h1></div><div style="padding: 40px 30px; line-height: 1.7; font-size: 16px;">${content}</div><div style="background-color: #fef9c3; padding: 20px; text-align: center; font-size: 12px; color: #854d0e;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'pastel':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', Arial, sans-serif; color: #4a4a4a; background-color: #fce7f3; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden;"><div style="background-color: #fbcfe8; padding: 40px 30px; text-align: center;"><h1 style="margin: 0; font-size: 24px; color: #be185d; font-weight: bold;">${title}</h1></div><div style="padding: 40px 30px; line-height: 1.7; font-size: 15px;">${content}</div><div style="padding: 20px; text-align: center; font-size: 11px; color: #9d174d;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'retro':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Courier New', Courier, monospace; color: #45301f; background-color: #d7ccc8; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #efebe9; border: 2px dashed #8d6e63; padding: 30px;"><div style="text-align: center; border-bottom: 2px solid #8d6e63; padding-bottom: 20px; margin-bottom: 20px;"><h1 style="margin: 0; font-size: 24px; font-weight: bold; text-transform: uppercase; color: #3e2723;">${title}</h1></div><div style="line-height: 1.6; font-size: 15px;">${content}</div><div style="margin-top: 30px; text-align: center; font-size: 12px; color: #5d4037;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'cyberpunk':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Verdana', sans-serif; color: #0ff; background-color: #000; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #111; border: 1px solid #f0f; box-shadow: 0 0 10px #f0f; padding: 30px;"><div style="text-align: left; border-bottom: 2px solid #ff0; padding-bottom: 10px; margin-bottom: 20px;"><h1 style="margin: 0; font-size: 24px; color: #f0f; text-transform: uppercase; letter-spacing: 2px;">${title}</h1></div><div style="line-height: 1.6; font-size: 14px; color: #ccc;">${content}</div><div style="margin-top: 30px; text-align: right; font-size: 10px; color: #ff0; border-top: 1px dashed #333; padding-top: 10px;"><p style="margin:0;">SYSTEM.YEAR: ${year} // ICT-WEST. ALL RIGHTS RESERVED.</p></div></div></body></html>`;
      case 'luxury':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: 'Times New Roman', Times, serif; color: #e5e7eb; background-color: #000000; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #111827; border: 1px solid #d4af37; padding: 40px;"><div style="text-align: center; margin-bottom: 40px;"><h1 style="margin: 0; font-size: 28px; color: #d4af37; font-weight: normal; letter-spacing: 3px; text-transform: uppercase;">${title}</h1></div><div style="line-height: 1.8; font-size: 15px; color: #d1d5db;">${content}</div><div style="margin-top: 50px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #374151; padding-top: 20px;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      case 'hitech':
        return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; background-color: #e5e7eb; margin: 0; padding: 40px 20px;"><div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);"><div style="padding: 25px 30px; border-bottom: 1px solid #f3f4f6;"><h1 style="margin: 0; font-size: 20px; color: #111827; font-weight: 600;">${title}</h1></div><div style="padding: 30px; line-height: 1.6; font-size: 14px;">${content}</div><div style="background-color: #f9fafb; padding: 15px 30px; text-align: left; font-size: 11px; color: #6b7280; border-top: 1px solid #f3f4f6;"><p style="margin:0;">© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p></div></div></body></html>`;
      default:
        return content;
    }
  }

  /**
   * Adds a new email address manually to a mailing campaign
   */
  async addAddress(mailingId: number, email: string) {
    if (!email) {
      throw new BadRequestException('Email обов’язковий');
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleaned = email.trim().toLowerCase();
    
    if (!emailRegex.test(cleaned)) {
      throw new BadRequestException('Некоректний формат email');
    }

    const runningJob = this.runningJobs.get(mailingId);
    if (runningJob && runningJob.status === 'RUNNING') {
      throw new BadRequestException('Неможливо додати адресу до активної розсилки');
    }

    // Check if mailing exists
    const contentCheck = await this.dbservice.query('SELECT id FROM mailing_content WHERE id = $1', [mailingId]);
    if (contentCheck.rows.length === 0) {
      throw new BadRequestException('Розсилку не знайдено');
    }

    // Check if email already exists in this mailing
    const existing = await this.dbservice.query(
      'SELECT id FROM mailing_address WHERE id_content = $1 AND email = $2',
      [mailingId, cleaned]
    );

    if (existing.rows.length > 0) {
      throw new BadRequestException('Ця електронна адреса вже є в списку розсилки');
    }

    const result = await this.dbservice.query(
      'INSERT INTO mailing_address (email, id_content, ids_status, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, email, ids_status, created_at',
      [cleaned, mailingId, 'PENDING']
    );

    await this.broadcastUpdate(mailingId);

    return result.rows[0];
  }

  /**
   * Removes an email address manually from a mailing campaign
   */
  async removeAddress(mailingId: number, addressId: number) {
    const runningJob = this.runningJobs.get(mailingId);
    if (runningJob && runningJob.status === 'RUNNING') {
      throw new BadRequestException('Неможливо видалити адресу з активної розсилки');
    }

    await this.dbservice.query(
      'DELETE FROM mailing_address WHERE id = $1 AND id_content = $2',
      [addressId, mailingId]
    );

    await this.broadcastUpdate(mailingId);

    return { status: 'ok' };
  }
}
