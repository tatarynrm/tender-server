import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Inject, forwardRef, Logger } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { MailService } from 'src/libs/common/mail/mail.service';
import { MailingService } from '../mailing.service';
import * as fs from 'fs';
import * as path from 'path';

@Processor('email-mailing', {
  concurrency: 1,
  limiter: {
    max: 5,
    duration: 15000, // 5 jobs per 15 seconds (highly safe to prevent spam blocking)
  },
})
export class MailingProcessor extends WorkerHost {
  private readonly logger = new Logger(MailingProcessor.name);

  constructor(
    private readonly dbservice: DatabaseService,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => MailingService))
    private readonly mailingService: MailingService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { mailingId, addressId, email, title, content, templateIds } = job.data;

    // Check if the mailing campaign is active and running
    const campaign = this.mailingService.getRunningJob(mailingId);
    if (!campaign || campaign.status !== 'RUNNING') {
      this.logger.log(`Skipping job ${job.id} for mailing ${mailingId} because campaign is not active.`);
      return { status: 'skipped_not_running' };
    }

    this.logger.log(`Processing email job ${job.id} for address ${email}`);

    // 1. Mark as PROCESSING in DB
    await this.dbservice.query(
      "UPDATE mailing_address SET ids_status = 'PROCESSING' WHERE id = $1",
      [addressId],
    );
    await this.mailingService.broadcastUpdate(mailingId);

    // 2. Wrap content with selected responsive HTML template
    const compiledHtml = this.mailingService.compileTemplate(templateIds || 'plain', content, title);

    // 3. Scan disk for campaign attachments to send
    let attachments: any[] = [];
    try {
      const dirPath = path.join(process.cwd(), 'uploads', 'mailings', String(mailingId));
      if (fs.existsSync(dirPath)) {
        const fileNames = fs.readdirSync(dirPath);
        attachments = fileNames.map(name => ({
          filename: name,
          path: path.join(dirPath, name),
        }));
      }
    } catch (fsErr) {
      this.logger.error(`Failed to load attachments from disk: ${fsErr.message}`);
    }

    // 4. Send email via Nodemailer service with attachments
    try {
      await this.mailService.sendMail(email, title, compiledHtml, attachments);

      // Mark as DONE
      await this.dbservice.query(
        "UPDATE mailing_address SET ids_status = 'DONE' WHERE id = $1",
        [addressId],
      );
    } catch (err) {
      this.logger.error(`Failed to send email to ${email}: ${err.message}`);

      // Mark as FAILED
      await this.dbservice.query(
        "UPDATE mailing_address SET ids_status = 'FAILED' WHERE id = $1",
        [addressId],
      );
    }

    // 5. Update campaign processed stats and broadcast progress
    campaign.processed++;
    await this.mailingService.broadcastUpdate(mailingId);

    // 6. Check if all emails for the campaign are completed
    const checkResult = await this.dbservice.query(
      "SELECT COUNT(id) as count FROM mailing_address WHERE id_content = $1 AND ids_status IN ('PENDING', 'PROCESSING')",
      [mailingId],
    );
    const activeCount = Number(checkResult.rows[0].count);

    if (activeCount === 0) {
      campaign.status = 'COMPLETED';
      await this.mailingService.broadcastUpdate(mailingId);
      this.mailingService.removeRunningJob(mailingId);
      this.mailingService.emitCompleted(mailingId);
      this.logger.log(`Mailing campaign ${mailingId} completed successfully.`);
    }

    return { status: 'success' };
  }
}
