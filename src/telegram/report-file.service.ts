import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as path from 'path';

// pdfmake 0.3: серверний API — setFonts + createPdf(...).getBuffer().
// Вбудований Roboto повністю покриває кирилицю.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfmake = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const robotoFonts = require('pdfmake/fonts/Roboto');

pdfmake.setFonts(robotoFonts);
// Звіти складаються лише з тексту й таблиць: зовнішні URL заборонені повністю,
// з локальних файлів дозволені тільки власні шрифти pdfmake (Roboto).
const PDFMAKE_FONTS_DIR = path.join(
  path.dirname(require.resolve('pdfmake/package.json')),
  'fonts',
);
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((filePath: string) =>
  path.resolve(String(filePath)).startsWith(PDFMAKE_FONTS_DIR),
);

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

  async buildXlsx(question: string, answer: string, rows: any[]): Promise<Buffer> {
    const BRAND = 'FF1F4E79'; // темно-синій ICT
    const STRIPE = 'FFF2F7FB';
    const BORDER = 'FFD9D9D9';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ICT Tender — ШІ-База';
    wb.created = new Date();

    // --- Аркуш «Звіт»: шапка, питання, відповідь ---
    const info = wb.addWorksheet('Звіт', {
      views: [{ showGridLines: false }],
    });
    info.columns = [{ width: 18 }, { width: 110 }];

    info.mergeCells('A1:B1');
    const title = info.getCell('A1');
    title.value = 'Звіт «ШІ-База» — ICT Tender';
    title.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    info.getRow(1).height = 30;

    const metaRows: [string, string | number][] = [
      ['Питання', question || '—'],
      ['Сформовано', new Date().toLocaleString('uk-UA', KYIV_STAMP)],
      ['Рядків даних', rows.length],
    ];
    metaRows.forEach(([label, value], i) => {
      const row = info.getRow(3 + i);
      row.getCell(1).value = label;
      row.getCell(1).font = { bold: true, color: { argb: BRAND } };
      row.getCell(2).value = value;
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    });

    const answerLabel = info.getCell('A7');
    answerLabel.value = 'Відповідь ШІ';
    answerLabel.font = { bold: true, color: { argb: BRAND } };
    const answerCell = info.getCell('B7');
    answerCell.value = stripMarkdown(answer);
    answerCell.alignment = { wrapText: true, vertical: 'top' };
    info.getRow(7).height = Math.min(
      400,
      Math.max(60, Math.ceil(stripMarkdown(answer).length / 110) * 14),
    );

    // --- Аркуш «Дані»: стилізована таблиця ---
    if (rows.length) {
      const flatRows = rows.map(flattenRow).map(coerceNumbers);
      const headers = Object.keys(flatRows[0]);

      const data = wb.addWorksheet('Дані', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      data.columns = headers.map((h) => ({
        header: h,
        key: h,
        width: columnWidth(h, flatRows),
      }));

      const headerRow = data.getRow(1);
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { bottom: { style: 'thin', color: { argb: BORDER } } };
      });

      for (const r of flatRows) {
        data.addRow(r);
      }

      data.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell({ includeEmpty: true }, (cell) => {
          if (rowNumber % 2 === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
          }
          cell.border = {
            bottom: { style: 'thin', color: { argb: BORDER } },
            right: { style: 'thin', color: { argb: BORDER } },
          };
          if (typeof cell.value === 'number' && !Number.isInteger(cell.value)) {
            cell.numFmt = '#,##0.00';
          } else if (typeof cell.value === 'number') {
            cell.numFmt = '#,##0';
          }
          cell.alignment = {
            vertical: 'top',
            horizontal: typeof cell.value === 'number' ? 'right' : 'left',
            wrapText: true,
          };
        });
      });

      data.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length },
      };
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer as ArrayBuffer);
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

/** Ширина колонки: заголовок + вибірка значень, у розумних межах. */
function columnWidth(header: string, rows: Record<string, any>[]): number {
  let max = header.length;
  for (const r of rows.slice(0, 50)) {
    const len = String(r[header] ?? '').length;
    if (len > max) max = len;
  }
  return Math.min(45, Math.max(10, max + 2));
}

/** Числа, що приїхали рядками (Postgres numeric), робимо числами для Excel. */
function coerceNumbers(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] =
      typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) && value.length < 15
        ? Number(value)
        : value;
  }
  return out;
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
