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
  templateId: string;
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
  ) {}

  async onModuleInit() {
    await this.initDatabase();
  }

  private async initDatabase() {
    try {
      await this.dbservice.query(`
        ALTER TABLE mailing_content 
        ADD COLUMN IF NOT EXISTS email_title VARCHAR(255),
        ADD COLUMN IF NOT EXISTS email_content TEXT,
        ADD COLUMN IF NOT EXISTS template_id VARCHAR(50) DEFAULT 'plain',
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
      `);
      console.log('Postgres table mailing_content altered/initialized successfully.');
    } catch (e) {
      console.error('Failed to initialize mailing_content table columns:', e.message);
    }
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
  async createMailing(itemName: string, fileBuffer: Buffer) {
    if (!itemName) {
      throw new BadRequestException('Назва розсилки обов’язкова');
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Excel файл не завантажено або порожній');
    }

    let emails: string[] = [];

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
        mc.template_id,
        mc.created_at,
        COUNT(ma.id) as total,
        COUNT(ma.id) FILTER (WHERE ma.ids_status = 'PENDING') as pending,
        COUNT(ma.id) FILTER (WHERE ma.ids_status = 'PROCESSING') as processing,
        COUNT(ma.id) FILTER (WHERE ma.ids_status = 'DONE') as done,
        COUNT(ma.id) FILTER (WHERE ma.ids_status = 'FAILED') as failed
      FROM (
        SELECT id, item_name, email_title, email_content, template_id, created_at
        FROM mailing_content
        ${searchCond}
        ORDER BY id DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      ) mc
      LEFT JOIN mailing_address ma ON mc.id = ma.id_content
      GROUP BY mc.id, mc.item_name, mc.email_title, mc.email_content, mc.template_id, mc.created_at
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
        template_id: row.template_id || 'plain',
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
      'SELECT id, item_name, email_title, email_content, template_id FROM mailing_content WHERE id = $1',
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
      template_id: mailing.template_id || 'plain',
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
   * Starts or resumes a mailing campaign
   */
  async startMailing(
    id: number,
    emailTitle: string,
    emailContent: string,
    templateId = 'plain',
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

    // Save title, content, and templateId to database
    await this.dbservice.query(
      'UPDATE mailing_content SET email_title = $1, email_content = $2, template_id = $3 WHERE id = $4',
      [emailTitle, emailContent, templateId, id]
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
      templateId,
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
        templateId,
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
  compileTemplate(templateId: string, content: string, title: string): string {
    const year = new Date().getFullYear();
    switch (templateId) {
      case 'corporate':
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; background-color: #f1f5f9; margin: 0; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 40px 30px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
    .content { padding: 40px 30px; line-height: 1.7; font-size: 15px; }
    .footer { background-color: #f8fafc; padding: 24px 30px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>© ${year} Група компаній ІСТ-Захід. Усі права захищено.</p>
      <p>Це автоматичне повідомлення. Будь ласка, не відповідайте на цей лист.</p>
    </div>
  </div>
</body>
</html>`;

      case 'newsletter':
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; background-color: #fafafa; margin: 0; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid #f1f5f9; }
    .badge { display: inline-block; background-color: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
    .banner { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 50px 40px; color: #ffffff; }
    .banner h1 { margin: 0; font-size: 28px; font-weight: 800; line-height: 1.2; }
    .content { padding: 40px; line-height: 1.8; font-size: 15px; }
    .footer { background-color: #0f172a; padding: 30px; text-align: center; font-size: 11px; color: #94a3b8; }
    .footer a { color: #38bdf8; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="banner">
      <div class="badge">Новини та Оновлення</div>
      <h1>${title}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Ви отримали цей лист, оскільки зареєстровані в системі ICTender.</p>
      <p><a href="#">Налаштувати сповіщення</a> • <a href="#">Конфіденційність</a></p>
    </div>
  </div>
</body>
</html>`;

      case 'minimal':
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #2c3e50; background-color: #fdfbf7; margin: 0; padding: 50px 20px; }
    .container { max-width: 580px; margin: 0 auto; padding: 20px; }
    .title { font-size: 22px; font-weight: 600; color: #1a252f; margin-bottom: 24px; border-left: 3px solid #d4af37; padding-left: 12px; }
    .content { line-height: 1.6; font-size: 15px; color: #34495e; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #f1ece4; font-size: 12px; color: #95a5a6; }
  </style>
</head>
<body>
  <div class="container">
    <h2 class="title">${title}</h2>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      З повагою, Група компаній ІСТ-Захід.
    </div>
  </div>
</body>
</html>`;

      case 'plain':
      default:
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 16px; border: 1px solid #e2e8f0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    ${content}
  </div>
</body>
</html>`;
    }
  }
}
