import { Controller, Get, Query, Res, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import axios from 'axios';
import { URL } from 'url';

// Блокуємо внутрішні/приватні адреси, щоб проксі не став SSRF-каналом
// (доступ до localhost, метаданих хмари 169.254.169.254, приватних мереж).
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  // IPv4 приватні / loopback / link-local
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

@Controller('files')
export class FilesController {
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // зовнішній проксі
  @Get('proxy')
  async proxyFile(@Query('url') url: string, @Res() res: Response) {
    if (!url) {
      return res.status(HttpStatus.BAD_REQUEST).send('URL is required');
    }

    // Валідація адреси: лише http/https і лише зовнішні хости.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(HttpStatus.BAD_REQUEST).send('Invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(HttpStatus.BAD_REQUEST).send('Unsupported scheme');
    }
    if (isBlockedHost(parsed.hostname)) {
      return res.status(HttpStatus.FORBIDDEN).send('Forbidden host');
    }

    try {
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        timeout: 15000,
        maxContentLength: 25 * 1024 * 1024,
      });

      // Передаємо заголовки типу контенту
      const contentType = response.headers['content-type'];
      if (contentType) {
        res.setHeader('Content-Type', contentType.toString());
      }

      // Стрімимо дані клієнту
      response.data.pipe(res);
    } catch (error) {
      console.error('Error proxying file:', error.message);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error fetching file');
    }
  }
}
