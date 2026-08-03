import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MailReaderService, NewMailSummary } from './mail-reader.service';
import { TelegramService } from '../telegram/telegram.service';

export const MAIL_READER_QUEUE = 'mail-reader';

function escapeHtml(input: string): string {
  return (input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatMailMessage(mail: NewMailSummary): string {
  const dateStr = mail.date
    ? new Date(mail.date).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })
    : '—';

  const lines = [
    '📩 <b>Новий лист на пошті ICT</b>',
    '',
    `👤 <b>Від:</b> ${escapeHtml(mail.from) || '—'}`,
    `📌 <b>Тема:</b> ${escapeHtml(mail.subject)}`,
    `🕒 <b>Дата:</b> ${escapeHtml(dateStr)}`,
  ];

  if (mail.preview) {
    lines.push('', `📝 ${escapeHtml(mail.preview)}${mail.preview.length >= 300 ? '…' : ''}`);
  }

  return lines.join('\n');
}

/**
 * Обробник черги перевірки пошти. Забирає нові листи через IMAP-конектор
 * і надсилає кожен окремим сповіщенням адміністратору в Telegram.
 * concurrency: 1 — щоб паралельні запуски не смикали IMAP одночасно.
 */
@Processor(MAIL_READER_QUEUE, { concurrency: 1 })
export class MailReaderProcessor extends WorkerHost {
  private readonly logger = new Logger(MailReaderProcessor.name);

  constructor(
    private readonly mailReaderService: MailReaderService,
    private readonly telegramService: TelegramService,
  ) {
    super();
  }

  async process(_job: Job): Promise<{ checked: boolean; newCount: number }> {
    let newMail: NewMailSummary[] = [];
    try {
      newMail = await this.mailReaderService.fetchNewMail();
    } catch (err: any) {
      this.logger.error(`Помилка перевірки пошти: ${err.message}`);
      return { checked: false, newCount: 0 };
    }

    for (const mail of newMail) {
      await this.telegramService.notifyAdmin(formatMailMessage(mail));
      // невелика пауза, щоб не впертись у ліміти Telegram при пачці листів
      await new Promise((r) => setTimeout(r, 400));
    }

    return { checked: true, newCount: newMail.length };
  }
}
