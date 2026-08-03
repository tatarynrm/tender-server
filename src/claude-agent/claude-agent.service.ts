import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { randomBytes } from 'crypto';

export type ClaudeTaskTarget = 'client' | 'server';

export interface ClaudeTaskRequest {
  chatId: number;
  target: ClaudeTaskTarget;
  task: string;
  requestedBy?: string;
}

export type StartResult =
  | { ok: true; target: ClaudeTaskTarget }
  | { ok: false; reason: string };

/**
 * Запускає автономну задачу Claude Code окремим процесом.
 *
 * Чому не в цьому процесі: задача йде 10-20 хвилин, а `/deploy` посеред неї
 * зробить `pm2 restart all`. Тому setsid + detached — так само, як деплой:
 * воркер переживає рестарт бекенда і звітує в Telegram самостійно.
 *
 * Одночасно виконується лише одна задача: обидві писали б в один робочий
 * каталог.
 */
@Injectable()
export class ClaudeAgentService {
  private readonly logger = new Logger(ClaudeAgentService.name);

  private readonly lockFile = '/tmp/ict-claude-task.lock';
  private readonly logFile: string;
  private readonly scriptPath: string;
  private readonly spoolDir: string;

  constructor(private readonly configService: ConfigService) {
    const serverDir = this.configService.get<string>('DEPLOY_SERVER_DIR') || process.cwd();

    this.scriptPath =
      this.configService.get<string>('CLAUDE_TASK_SCRIPT') ||
      resolve(serverDir, 'scripts', 'claude-task.mjs');

    this.logFile =
      this.configService.get<string>('CLAUDE_TASK_LOG') || '/var/log/ict-claude-task.log';

    this.spoolDir = '/tmp/ict-claude-tasks';
  }

  /**
   * Чи виконується зараз задача. Мертвий lock прибирає сам.
   *
   * У локі або `pending:<мс>` — це ми щойно запустили воркер, але він ще не
   * встиг записати себе, або pid воркера. Через `setsid` pid дочірнього
   * процесу тут не годиться: setsid форкається і одразу помирає, тому
   * володіння локом бере на себе сам воркер.
   */
  isBusy(): boolean {
    if (!existsSync(this.lockFile)) return false;

    let raw = '';
    try {
      raw = readFileSync(this.lockFile, 'utf8').trim();
    } catch {
      return false;
    }

    if (raw.startsWith('pending:')) {
      const started = Number(raw.slice('pending:'.length));
      // воркер не підхопив lock за хвилину — вважаємо, що не стартував
      if (Number.isFinite(started) && Date.now() - started < 60_000) return true;
      this.clearLock();
      return false;
    }

    const pid = Number(raw);
    if (!pid) {
      this.clearLock();
      return false;
    }

    try {
      // сигнал 0 нічого не робить, лише перевіряє, чи процес живий
      process.kill(pid, 0);
      return true;
    } catch {
      this.clearLock();
      return false;
    }
  }

  private clearLock() {
    try {
      unlinkSync(this.lockFile);
    } catch {
      /* прибрати не вдалося — не критично */
    }
  }

  start(request: ClaudeTaskRequest): StartResult {
    if (!existsSync(this.scriptPath)) {
      this.logger.error(`Не знайдено скрипт задачі: ${this.scriptPath}`);
      return { ok: false, reason: `не знайдено ${this.scriptPath}` };
    }

    if (this.isBusy()) {
      return { ok: false, reason: 'уже виконується інша задача' };
    }

    let taskFile: string;
    try {
      mkdirSync(this.spoolDir, { recursive: true });
      taskFile = join(this.spoolDir, `${randomBytes(6).toString('hex')}.json`);
      // UTF-8 обов'язково: опис задачі українською
      writeFileSync(taskFile, JSON.stringify(request), 'utf8');
      // займаємо lock одразу, щоб дві швидкі команди підряд не розійшлися;
      // воркер перезапише його своїм pid
      writeFileSync(this.lockFile, `pending:${Date.now()}`, 'utf8');
    } catch (err: any) {
      this.logger.error(`Не вдалося записати файл задачі: ${err.message}`);
      return { ok: false, reason: 'не вдалося записати файл задачі' };
    }

    try {
      // stdout/stderr воркера пишемо у файл: у detached-процесі труби
      // все одно нікому читати, а лог потрібен для розбору падінь
      let logFd: number | 'ignore' = 'ignore';
      try {
        logFd = openSync(this.logFile, 'a');
      } catch {
        this.logger.warn(`Немає доступу до ${this.logFile}, лог воркера втрачається`);
      }

      const child = spawn('setsid', ['node', this.scriptPath, taskFile], {
        detached: true,
        stdio: ['ignore', logFd as any, logFd as any],
        env: process.env,
      });

      if (!child.pid) throw new Error('процес не стартував');

      child.unref();

      this.logger.log(`Задача Claude запущена (target=${request.target})`);
      return { ok: true, target: request.target };
    } catch (err: any) {
      this.logger.error(`Не вдалося запустити задачу: ${err.message}`);
      this.clearLock();
      try {
        unlinkSync(taskFile);
      } catch {
        /* спул почистить наступний запуск */
      }
      return { ok: false, reason: err.message };
    }
  }
}
