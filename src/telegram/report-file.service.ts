import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';

// pdfmake 0.3: серверний API — setFonts + createPdf(...).getBuffer().
// Вбудований Roboto повністю покриває кирилицю.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfmake = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const robotoFonts = require('pdfmake/fonts/Roboto');

pdfmake.setFonts(robotoFonts);
// Звіти складаються лише з тексту й таблиць — жодних зовнішніх ресурсів
// чи читання файлової системи документом бути не може.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(() => false);

const KYIV_STAMP: Intl.DateTimeFormatOptions = {
  timeZone: 'Europe/Kyiv',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

/**
 * Генерація файлів звітів для «ШІ-Бази»: Excel (пакет xlsx) і PDF (pdfmake).
 * На вхід — питання адміністратора, текстова відповідь ШІ і сирі рядки
 * з read-only запиту; на вихід — Buffer, готовий для Telegram чи пошти.
 */
@Injectable()
export class ReportFileService {
  private readonly logger = new Logger(ReportFileService.name);

  /** Ім'я файлу: латиниця, без пробілів — безпечно і для пошти, і для ОС. */
  buildFileName(ext: 'pdf' | 'xlsx'): string {
    const stamp = new Date()
      .toLocaleString('sv-SE', { timeZone: 'Europe/Kyiv' })
      .replace(' ', '_')
      .replace(/:/g, '-')
      .slice(0, 16);
    return `AI_BAZA_zvit_${stamp}.${ext}`;
  }

  buildXlsx(question: string, answer: string, rows: any[]): Buffer {
    const wb = XLSX.utils.book_new();

    const infoSheet = XLSX.utils.aoa_to_sheet([
      ['Звіт «ШІ-База» — ICT Tender'],
      [],
      ['Питання', question || '—'],
      ['Сформовано', new Date().toLocaleString('uk-UA', KYIV_STAMP)],
      ['Рядків даних', rows.length],
      [],
      ['Відповідь ШІ'],
      [stripMarkdown(answer)],
    ]);
    infoSheet['!cols'] = [{ wch: 18 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, infoSheet, 'Звіт');

    if (rows.length) {
      const dataSheet = XLSX.utils.json_to_sheet(rows.map(flattenRow));
      const headers = Object.keys(flattenRow(rows[0]));
      dataSheet['!cols'] = headers.map((h) => ({
        wch: Math.min(40, Math.max(12, h.length + 2)),
      }));
      XLSX.utils.book_append_sheet(wb, dataSheet, 'Дані');
    }

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async buildPdf(question: string, answer: string, rows: any[]): Promise<Buffer> {
    const flatRows = rows.map(flattenRow);
    const headers = flatRows.length ? Object.keys(flatRows[0]) : [];
    const wide = headers.length > 6;

    const content: any[] = [
      { text: 'Звіт «ШІ-База» — ICT Tender', style: 'header' },
      {
        text: `Сформовано: ${new Date().toLocaleString('uk-UA', KYIV_STAMP)}`,
        style: 'meta',
      },
      { text: 'Питання', style: 'section' },
      { text: question || '—', margin: [0, 0, 0, 8] },
      { text: 'Відповідь', style: 'section' },
      { text: stripMarkdown(answer), margin: [0, 0, 0, 10] },
    ];

    if (flatRows.length) {
      content.push({ text: `Дані (${flatRows.length} рядків)`, style: 'section' });
      content.push({
        table: {
          headerRows: 1,
          widths: headers.map(() => 'auto'),
          body: [
            headers.map((h) => ({ text: h, bold: true, fillColor: '#eeeeee' })),
            ...flatRows.map((r) => headers.map((h) => String(r[h] ?? ''))),
          ],
        },
        fontSize: wide ? 7 : 9,
        layout: 'lightHorizontalLines',
      });
    }

    const docDefinition = {
      pageOrientation: wide ? 'landscape' : 'portrait',
      pageMargins: [30, 30, 30, 30],
      content,
      styles: {
        header: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        meta: { fontSize: 9, color: '#555555', margin: [0, 0, 0, 10] },
        section: { fontSize: 12, bold: true, margin: [0, 6, 0, 4] },
      },
      defaultStyle: { font: 'Roboto', fontSize: 10 },
    };

    const buffer: Uint8Array = await pdfmake.createPdf(docDefinition).getBuffer();
    return Buffer.from(buffer);
  }
}

/** Вкладені об'єкти/дати зводимо до плоских рядкових значень для таблиць. */
function flattenRow(row: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value === null || value === undefined) {
      out[key] = '';
    } else if (value instanceof Date) {
      out[key] = value.toLocaleString('uk-UA', KYIV_STAMP);
    } else if (typeof value === 'object') {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Прибираємо телеграмний маркдаун, щоб у файл не потрапили ** та ``` . */
function stripMarkdown(text: string): string {
  return (text || '')
    .replace(/```[a-z]*\n?/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1')
    .trim();
}
