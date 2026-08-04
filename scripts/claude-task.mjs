#!/usr/bin/env node
/**
 * Автономна задача Claude Code: з опису в Telegram — гілка з кодом.
 *
 *   node scripts/claude-task.mjs <шлях-до-json>
 *
 * JSON: { chatId, target: 'client'|'server', task, requestedBy }
 *
 * Що робить:
 *   1. готує ОКРЕМИЙ клон репозиторію (не прод-каталог!)
 *   2. заводить гілку claude/<target>-<дата> від origin/main
 *   3. віддає задачу Claude Code через Agent SDK
 *   4. перевіряє збірку
 *   5. просить погодження в Telegram і пушить гілку
 *
 * Прод не чіпається взагалі: ні pm2, ні main, ні робоча копія деплою.
 * Мердж і викочування лишаються ручними.
 *
 * Запускається від'єднано (setsid) з ClaudeAgentService — задача живе
 * 10-20 хвилин і мусить пережити рестарт бекенда.
 */

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';

const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Lock тримає воркер, а не той, хто його запустив: setsid форкається, і pid
 * дочірнього процесу вмирає одразу. ClaudeAgentService лише ставить
 * `pending:<мс>`, а справжнім власником стаємо ми.
 */
const LOCK_FILE = process.env.CLAUDE_TASK_LOCK || '/tmp/ict-claude-task.lock';

function takeLock() {
  try {
    writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
  } catch {
    /* без локу просто втрачаємо захист від паралельного запуску */
  }
}

function releaseLock() {
  try {
    if (readFileSync(LOCK_FILE, 'utf8').trim() === String(process.pid)) {
      rmSync(LOCK_FILE, { force: true });
    }
  } catch {
    /* нічого не вдієш */
  }
}

process.on('exit', releaseLock);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => process.exit(1));
}

/** Скільки задача може йти, поки її не приб'ють. */
const TASK_TIMEOUT_MS = 25 * 60 * 1000;
/** Стеля вартості однієї задачі. Далі SDK сам зупиняє прогін. */
const BUDGET_USD = Number(process.env.CLAUDE_TASK_BUDGET_USD || 8);
/** Не частіше одного повідомлення про прогрес у Telegram. */
const PROGRESS_EVERY_MS = 25 * 1000;

const REPOS = {
  client: {
    label: 'фронт (client-ai)',
    prodDir: process.env.DEPLOY_CLIENT_DIR || '/rtdata/tender/tender-client-main',
    // швидка перевірка типів; повний next build лишаємо деплою
    check: ['npx', 'tsc', '--noEmit'],
    checkLabel: 'npx tsc --noEmit',
  },
  server: {
    label: 'бекенд (server-ai)',
    prodDir: process.env.DEPLOY_SERVER_DIR || '/rtdata/tender/tender-server',
    check: ['npm', 'run', 'build'],
    checkLabel: 'npm run build',
  },
};

const WORK_ROOT = process.env.CLAUDE_WORK_ROOT || '/rtdata/tender/claude-work';

// --- .env ------------------------------------------------------------------

function readEnv(keys) {
  let raw;
  try {
    raw = readFileSync(join(SERVER_DIR, '.env'), 'utf8');
  } catch {
    return {};
  }
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m || !keys.includes(m[1])) continue;
    let v = m[2].trim().replace(/\s+#.*$/, '');
    if (
      (v.startsWith("'") && v.endsWith("'")) ||
      (v.startsWith('"') && v.endsWith('"'))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = readEnv([
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ADMIN_ID',
  'APPROVAL_SECRET',
  'APPROVAL_URL',
  'SERVER_URL',
  'ANTHROPIC_API_KEY',
]);

// --- Telegram --------------------------------------------------------------

let CHAT_ID = '';

async function tg(text) {
  if (!env.TELEGRAM_BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch (e) {
    log(`не вдалося написати в Telegram: ${e.message}`);
  }
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function fail(msg) {
  log(`FAIL: ${msg}`);
  await tg(`🚨 Задача зупинена\n\n${msg}\n\nПрод не чіпався.`);
  process.exit(1);
}

// --- Погодження через той самий канал, що й у Claude Code ------------------

const approvalBase = (
  env.APPROVAL_URL ||
  env.SERVER_URL ||
  'http://localhost:7000'
).replace(/\/+$/, '');

/**
 * Створює запит на погодження і чекає рішення адміна.
 * Повертає true/false. Якщо канал недоступний — false (fail-closed:
 * тут нікого немає біля термінала, тому "спитати" означає "не робити").
 */
async function askApproval(tool, summary, detail, timeoutMs = 10 * 60 * 1000) {
  if (!env.APPROVAL_SECRET) {
    log('APPROVAL_SECRET не заданий — вважаю за відмову');
    return false;
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-approval-secret': env.APPROVAL_SECRET,
  };

  let id;
  try {
    const res = await fetch(`${approvalBase}/approval/request`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tool, summary, detail }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      log(`approval/request відповів ${res.status}`);
      return false;
    }
    id = (await res.json()).id;
  } catch (e) {
    log(`канал погодження недоступний: ${e.message}`);
    return false;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(`${approvalBase}/approval/${id}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const { status } = await res.json();
      if (status === 'approved') return true;
      if (status === 'denied') return false;
    } catch {
      // мережа моргнула — пробуємо ще
    }
  }

  log('немає відповіді на погодження — вважаю за відмову');
  return false;
}

// --- Команди ---------------------------------------------------------------

function run(cmd, args, cwd, timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolveRun) => {
    const child = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32',
      env: { ...process.env, CI: '1' },
    });

    let out = '';
    const take = (b) => {
      out += b.toString();
      if (out.length > 200_000) out = out.slice(-200_000);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code: code ?? -1, out: out.trim() });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolveRun({ code: -1, out: e.message });
    });
  });
}

async function git(args, cwd) {
  const r = await run('git', args, cwd);
  log(`git ${args.join(' ')} -> ${r.code}`);
  return r;
}

// --- Робоча копія ----------------------------------------------------------

/**
 * Готує окремий клон. Прод-каталог використовується лише як джерело
 * об'єктів (швидко, без мережі), origin переставляється на GitHub, щоб
 * пуш ішов туди ж, куди й завжди.
 */
async function prepareWorkdir(repo, branch) {
  mkdirSync(WORK_ROOT, { recursive: true });
  const workDir = join(WORK_ROOT, repo.key);

  if (!existsSync(join(workDir, '.git'))) {
    await tg('📦 Готую робочу копію — перший раз це кілька хвилин...');
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });

    const cloned = await git(['clone', repo.prodDir, workDir], WORK_ROOT);
    if (cloned.code !== 0) {
      await fail(`не вдалося клонувати ${repo.prodDir}\n\n${tail(cloned.out)}`);
    }

    const remote = await git(['remote', 'get-url', 'origin'], repo.prodDir);
    if (remote.code === 0 && remote.out) {
      await git(['remote', 'set-url', 'origin', remote.out.trim()], workDir);
    }
  }

  const fetched = await git(['fetch', '--prune', 'origin', 'main'], workDir);
  if (fetched.code !== 0) {
    await fail(`git fetch не пройшов\n\n${tail(fetched.out)}`);
  }

  // -B: якщо гілка з такою назвою вже є, переводимо її на свіжий main
  const co = await git(['checkout', '-B', branch, 'origin/main'], workDir);
  if (co.code !== 0) {
    await fail(`не вдалося створити гілку ${branch}\n\n${tail(co.out)}`);
  }

  await git(['clean', '-fd'], workDir);

  if (!existsSync(join(workDir, 'node_modules'))) {
    await tg('📦 Ставлю залежності в робочій копії...');
    const inst = await run(
      'npm',
      ['install', '--no-audit', '--no-fund'],
      workDir,
      20 * 60 * 1000,
    );
    if (inst.code !== 0) {
      await fail(`npm install у робочій копії впав\n\n${tail(inst.out)}`);
    }
  }

  return workDir;
}

function tail(text, lines = 15) {
  return String(text).split('\n').slice(-lines).join('\n').slice(-1500);
}

// --- Правила доступу для агента --------------------------------------------

/**
 * Що агент може без запитань. Git свідомо відсутній: версіонуванням
 * займається цей скрипт, а не модель — так гілка й коміт передбачувані.
 */
const ALLOWED_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Edit',
  'Write',
  'TodoWrite',
  'Bash(npx tsc:*)',
  'Bash(npm run build:*)',
  'Bash(ls:*)',
];

const DISALLOWED_TOOLS = [
  'Bash(git:*)',
  'Bash(rm:*)',
  'Bash(sudo:*)',
  'Bash(pm2:*)',
  'Bash(curl:*)',
  'Bash(npm publish:*)',
  'WebFetch',
];

const CONVENTIONS = `
Ти працюєш автономно: людини біля термінала немає, запитати нічого не можна.
Робиш повну задачу і зупиняєшся. Якщо чогось критично бракує — не вигадуй
замінник, а опиши в підсумку, чого саме бракує.

Жорсткі межі цієї задачі:
- Схему й процедури Postgres МИ НЕ МІНЯЄМО. Якщо потрібних даних не віддає
  жодна наявна процедура — так і напиши в підсумку, не вигадуй SQL і не
  підставляй фейкові дані замість реальних.
- Не чіпай .env, .github/workflows, package.json, docker-compose.
- Не запускай git — гілку й коміт зробить скрипт, який тебе викликав.
- Уся текстівка інтерфейсу — українською.

У кінці відповіді дай коротке резюме: що змінив (список файлів) і що
лишилося зробити людині.
`.trim();

// --- Головне ---------------------------------------------------------------

async function main() {
  takeLock();

  const taskFile = process.argv[2];
  if (!taskFile) {
    log('не передано шлях до файлу задачі');
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(taskFile, 'utf8'));
  } catch (e) {
    log(`не читається файл задачі: ${e.message}`);
    process.exit(1);
  }
  // файл із задачею більше не потрібен
  try {
    rmSync(taskFile, { force: true });
  } catch {}

  CHAT_ID = String(payload.chatId || env.TELEGRAM_ADMIN_ID || '');

  const repoKey = payload.target === 'server' ? 'server' : 'client';
  const repo = { ...REPOS[repoKey], key: repoKey };
  const task = String(payload.task || '').trim();

  if (!task) await fail('порожній опис задачі');

  // Ключ — не єдиний спосіб автентифікації: моделі Claude можна брати через
  // Vertex AI (Google Cloud), Bedrock або Foundry, і тоді рахунок іде туди.
  // Код від цього не залежить — достатньо змінних оточення.
  const hasAuth =
    env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.CLAUDE_CODE_USE_VERTEX === '1' ||
    process.env.CLAUDE_CODE_USE_BEDROCK === '1' ||
    process.env.CLAUDE_CODE_USE_FOUNDRY === '1';

  if (!hasAuth) {
    await fail(
      'Немає автентифікації для Claude Code.\n' +
        'Постав ANTHROPIC_API_KEY у server-ai/.env або ввімкни ' +
        'CLAUDE_CODE_USE_VERTEX / CLAUDE_CODE_USE_BEDROCK.',
    );
  }

  const stamp = new Date()
    .toISOString()
    .slice(0, 16)
    .replace(/[-:]/g, '')
    .replace('T', '-');
  const branch = `claude/${repoKey}-${stamp}`;

  log(`старт: target=${repoKey} branch=${branch}`);
  await tg(
    [
      '🤖 Задача прийнята',
      '',
      `Репозиторій: ${repo.label}`,
      `Гілка: ${branch}`,
      '',
      task.slice(0, 500),
      '',
      'Прод не чіпаю — зроблю гілку й покажу diff.',
    ].join('\n'),
  );

  const workDir = await prepareWorkdir(repo, branch);

  // --- прогін агента -------------------------------------------------------

  await tg('🧠 Claude почав роботу...');

  const ac = new AbortController();
  const killer = setTimeout(() => ac.abort(), TASK_TIMEOUT_MS);

  const denials = [];
  let lastProgressAt = 0;
  let lastActivity = '';
  let summary = '';
  let cost = 0;
  let turns = 0;
  let hadError = false;

  try {
    const q = query({
      prompt: task,
      options: {
        cwd: workDir,
        model: process.env.CLAUDE_TASK_MODEL || 'claude-opus-5',
        permissionMode: 'default',
        settingSources: ['project'],
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: CONVENTIONS,
        },
        allowedTools: ALLOWED_TOOLS,
        disallowedTools: DISALLOWED_TOOLS,
        maxTurns: 120,
        maxBudgetUsd: BUDGET_USD,
        abortController: ac,
        // ключ підставляємо лише якщо він є: при роботі через Vertex/Bedrock
        // його немає взагалі, і порожнє значення тут усе б зламало
        env: {
          ...process.env,
          ...(process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY
            ? {
                ANTHROPIC_API_KEY:
                  process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY,
              }
            : {}),
        },
        // Fail-closed: усе, що не в білому списку, отримує відмову з
        // поясненням. Нікого немає, хто міг би відповісти на запит.
        canUseTool: async (toolName, input) => {
          const detail =
            typeof input?.command === 'string'
              ? input.command
              : String(input?.file_path || '');
          denials.push(`${toolName} ${detail}`.trim().slice(0, 120));
          log(`ВІДМОВА: ${toolName} ${detail}`);
          return {
            behavior: 'deny',
            message:
              'Цей інструмент недоступний в автономному режимі. ' +
              'Зроби задачу доступними засобами, а потребу згадай у підсумку.',
          };
        },
      },
    });

    for await (const message of q) {
      if (message.type === 'assistant') {
        for (const block of message.message.content || []) {
          if (block.type === 'tool_use') {
            const p = block.input || {};
            const arg = p.file_path || p.pattern || p.command || '';
            lastActivity = `${block.name} ${String(arg).slice(0, 60)}`.trim();
          }
        }
        const now = Date.now();
        if (lastActivity && now - lastProgressAt > PROGRESS_EVERY_MS) {
          lastProgressAt = now;
          await tg(`⚙️ ${lastActivity}`);
        }
      }

      if (message.type === 'result') {
        cost = message.total_cost_usd ?? 0;
        turns = message.num_turns ?? 0;
        hadError = message.is_error === true;
        summary =
          message.subtype === 'success'
            ? String(message.result || '')
            : `Прогін завершився з ${message.subtype}`;
        log(`result: ${message.subtype} turns=${turns} cost=${cost}`);
      }
    }
  } catch (e) {
    clearTimeout(killer);
    await fail(
      ac.signal.aborted
        ? `Задача перевищила ${Math.round(TASK_TIMEOUT_MS / 60000)} хв і була зупинена.`
        : `Claude Code впав: ${e.message}`,
    );
  }
  clearTimeout(killer);

  // --- що змінилося --------------------------------------------------------

  const status = await git(['status', '--porcelain'], workDir);
  if (!status.out) {
    await tg(
      [
        'ℹ️ Задача завершена, але змін у файлах немає.',
        '',
        summary.slice(0, 1500) || '(без підсумку)',
        '',
        `Кроків: ${turns}, вартість: $${cost.toFixed(2)}`,
      ].join('\n'),
    );
    process.exit(0);
  }

  const changed = status.out
    .split('\n')
    .map((l) => l.slice(3))
    .filter(Boolean);

  // --- перевірка збірки ----------------------------------------------------

  await tg(`🔍 Перевіряю: ${repo.checkLabel}`);
  const check = await run(repo.check[0], repo.check.slice(1), workDir);

  if (check.code !== 0) {
    await tg(
      [
        '❌ Код не збирається — гілку не пушу.',
        '',
        `${repo.checkLabel} впав:`,
        tail(check.out, 12),
        '',
        `Змінені файли: ${changed.length}`,
        `Кроків: ${turns}, вартість: $${cost.toFixed(2)}`,
        '',
        `Робоча копія лишилась: ${workDir}`,
      ].join('\n'),
    );
    process.exit(1);
  }

  // --- коміт і пуш ---------------------------------------------------------

  const subject = task.split('\n')[0].slice(0, 68);

  await git(['add', '-A'], workDir);
  const commit = await git(
    [
      '-c',
      'user.name=Claude Task Bot',
      '-c',
      'user.email=noreply@ict.lviv.ua',
      'commit',
      '-m',
      subject,
      '-m',
      `Задача з Telegram від ${payload.requestedBy || 'адміністратора'}.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>`,
    ],
    workDir,
  );
  if (commit.code !== 0) {
    await fail(`git commit не пройшов\n\n${tail(commit.out)}`);
  }

  const autoPush = process.env.CLAUDE_TASK_AUTOPUSH === '1';
  const approved =
    autoPush ||
    (await askApproval(
      'Bash',
      `git push — гілка ${branch}`,
      `${repo.label}\nФайлів змінено: ${changed.length}\n${changed.slice(0, 10).join('\n')}`,
    ));

  if (!approved) {
    await tg(
      [
        '⏸ Пуш не погоджено — гілка лишилась лише на сервері.',
        '',
        `Каталог: ${workDir}`,
        `Гілка: ${branch}`,
        `Файлів: ${changed.length}`,
        `Кроків: ${turns}, вартість: $${cost.toFixed(2)}`,
      ].join('\n'),
    );
    process.exit(0);
  }

  // без --force: ім'я гілки містить хвилину, збіг практично неможливий,
  // а перезапис чужої гілки — саме те, чого тут не має статися
  const push = await git(['push', '-u', 'origin', branch], workDir);
  if (push.code !== 0) {
    await fail(`git push не пройшов\n\n${tail(push.out)}`);
  }

  // --- звіт ----------------------------------------------------------------

  const remote = await git(['remote', 'get-url', 'origin'], workDir);
  const repoPath = (remote.out || '')
    .trim()
    .replace(/^.*github\.com[:/]/, '')
    .replace(/\.git$/, '');
  const compareUrl = repoPath
    ? `https://github.com/${repoPath}/compare/main...${branch}?expand=1`
    : '';

  const report = [
    hadError ? '⚠️ Готово, але з зауваженнями' : '✅ Готово',
    '',
    `Гілка: ${branch}`,
    `Файлів змінено: ${changed.length}`,
    ...changed.slice(0, 12).map((f) => `• ${f}`),
  ];
  if (changed.length > 12) report.push(`…і ще ${changed.length - 12}`);

  report.push('', `${repo.checkLabel}: пройшов`);
  report.push(`Кроків: ${turns}, вартість: $${cost.toFixed(2)}`);

  if (denials.length) {
    report.push(`Агент просив і не отримав: ${denials.slice(0, 5).join(', ')}`);
  }
  if (summary) report.push('', `Підсумок:\n${summary.slice(0, 1200)}`);
  if (compareUrl) report.push('', `Diff і PR:\n${compareUrl}`);

  report.push('', 'У main нічого не пішло. Мердж і /deploy — вручну.');

  await tg(report.join('\n'));

  log('done');
  process.exit(0);
}

main().catch(async (e) => {
  log(`невиловлена помилка: ${e?.stack || e}`);
  await tg(`🚨 Задача впала: ${e?.message || e}`);
  process.exit(1);
});
