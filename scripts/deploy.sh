#!/usr/bin/env bash
#
# Деплой ICT Tender на VPS. Запускається ботом (/deploy) або руками.
#
#   bash /root/deploy.sh [CHAT_ID] [--force]
#
# CHAT_ID — куди слати звіт. Без нього береться TELEGRAM_ADMIN_ID з .env бекенда.
# --force — зібрати й перезапустити, навіть якщо в git нічого не змінилося.
#
# Звітує в Telegram САМ, а не через бота: останній крок — pm2 restart all,
# який вбиває процес бекенда разом із ботом. Тому бот запускає цей скрипт
# від'єднано (setsid) і одразу забуває про нього.

set -uo pipefail

SERVER_DIR="${DEPLOY_SERVER_DIR:-/rtdata/tender/tender-server}"
CLIENT_DIR="${DEPLOY_CLIENT_DIR:-/rtdata/tender/tender-client-main}"
BRANCH="${DEPLOY_BRANCH:-main}"
STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/ict-deploy}"
LOG_FILE="${DEPLOY_LOG:-/var/log/ict-deploy.log}"
LOCK_FILE="/tmp/ict-deploy.lock"
BUILD_LOG="/tmp/ict-deploy-build.log"

CHAT_ID=""
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *[!0-9-]*) ;;
    ?*) CHAT_ID="$arg" ;;
  esac
done

mkdir -p "$STATE_DIR" "$(dirname "$LOG_FILE")"
# лог не має рости вічно — лишаємо хвіст
if [ -f "$LOG_FILE" ] && [ "$(wc -l < "$LOG_FILE")" -gt 5000 ]; then
  tail -n 2000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi
exec >> "$LOG_FILE" 2>&1
echo "===== $(date '+%F %T') deploy start (force=$FORCE) ====="

# npm і pm2 часто стоять під nvm, а процес, який нас запустив (бекенд під pm2),
# їх у PATH не має. Той самий крок робить і GitHub Actions workflow.
if ! command -v pm2 >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-/root/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi
command -v npm >/dev/null 2>&1 || { echo "npm не знайдено в PATH"; }
command -v pm2 >/dev/null 2>&1 || { echo "pm2 не знайдено в PATH"; }

# --- Telegram -----------------------------------------------------------

read_env() {
  # читає KEY з .env бекенда; значення в лапках і коментарі в кінці рядка знімає
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$SERVER_DIR/.env" 2>/dev/null \
    | head -1 | sed "s/[[:space:]]*#.*$//" | tr -d "\"'" | tr -d '\r'
}

TG_TOKEN="$(read_env TELEGRAM_BOT_TOKEN)"
[ -z "$CHAT_ID" ] && CHAT_ID="$(read_env TELEGRAM_ADMIN_ID)"

tg() {
  [ -z "$TG_TOKEN" ] && return 0
  [ -z "$CHAT_ID" ] && return 0
  curl -s -m 20 -o /dev/null \
    -X POST "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
    -d chat_id="$CHAT_ID" \
    -d disable_web_page_preview=true \
    --data-urlencode "text=$1" || true
}

fail() {
  echo "FAIL: $1"
  tg "🚨 Деплой зупинено

$1

pm2 НЕ перезапускався — на проді працює попередня версія.
Лог: $LOG_FILE"
  exit 1
}

# --- Один деплой за раз -------------------------------------------------

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "already running"
    tg "⚠️ Деплой уже виконується. Дочекайся звіту про попередній."
    exit 1
  fi
else
  # без flock блокування немає — краще так, ніж зовсім не деплоїти
  echo "warning: flock відсутній, паралельні запуски не захищені"
fi

# --- Оновлення репозиторію ----------------------------------------------

# Кладе "changed" або "same" у REPO_STATE. Навмисно не через stdout і $( ):
# у підоболонці exit із fail() завершив би лише її, а скрипт поїхав би далі
# з порожнім станом і дійшов до pm2 restart.
#
# Порівнюємо з ревізією ОСТАННЬОГО ВДАЛОГО деплою, а не з тим, що було до
# pull: інакше після невдалої збірки повторний запуск вирішив би, що змін
# немає, і не перезібрав би нічого.
REPO_STATE=""
update_repo() {
  local dir="$1" name="$2"
  # окремим рядком: bash розкриває всі слова `local` до присвоєння,
  # тому в одному оголошенні $name тут був би ще порожній
  local state_file="$STATE_DIR/$name.rev"
  cd "$dir" || fail "немає каталогу $dir"

  git fetch --prune origin "$BRANCH" || fail "$name: git fetch не пройшов"
  git reset --hard "origin/$BRANCH" >/dev/null || fail "$name: git reset не пройшов"

  local head deployed
  head="$(git rev-parse HEAD)"
  deployed="$(cat "$state_file" 2>/dev/null || echo none)"
  echo "$name: HEAD=$head deployed=$deployed"

  if [ "$head" = "$deployed" ] && [ "$FORCE" -eq 0 ]; then
    REPO_STATE=same
  else
    REPO_STATE=changed
  fi
}

# --- Збірка -------------------------------------------------------------

build_repo() {
  local dir="$1" name="$2"
  cd "$dir" || fail "немає каталогу $dir"

  echo "--- $name: npm install"
  # --include=dev обов'язково: нас запускає процес під pm2, а він тягне за собою
  # NODE_ENV=production, через що npm мовчки пропускає devDependencies. Збірці ж
  # потрібні саме вони — typescript, @types/express, @types/multer тощо.
  # Без цього прапорця збірка падає на TS2503 "Cannot find namespace 'Express'".
  NODE_ENV=development npm install --include=dev --no-audit --no-fund \
    || fail "$name: npm install впав"

  echo "--- $name: npm run build"
  if ! npm run build > "$BUILD_LOG" 2>&1; then
    cat "$BUILD_LOG"
    # хвіст помилок одразу в Telegram, щоб не лізти на сервер за причиною
    local tail_txt
    tail_txt="$(grep -E "error|Error|ERR!" "$BUILD_LOG" | tail -n 12)"
    [ -z "$tail_txt" ] && tail_txt="$(tail -n 12 "$BUILD_LOG")"
    fail "$name: збірка впала

$tail_txt

Повний лог: $LOG_FILE"
  fi
  cat "$BUILD_LOG"
}

mark_deployed() {
  git -C "$1" rev-parse HEAD > "$STATE_DIR/$2.rev"
}

# --- Поїхали ------------------------------------------------------------

tg "⏳ Деплой запущено
Гілка: $BRANCH"

update_repo "$SERVER_DIR" server; SERVER_STATE="$REPO_STATE"
update_repo "$CLIENT_DIR" client; CLIENT_STATE="$REPO_STATE"

if [ "$SERVER_STATE" = same ] && [ "$CLIENT_STATE" = same ]; then
  tg "✅ Змін немає — обидва репозиторії вже на останній ревізії.
pm2 не чіпав. Щоб перезібрати примусово: /deploy force"
  echo "nothing to do"
  exit 0
fi

# Спершу збираємо ОБИДВІ частини і тільки потім рестартуємо. Якщо клієнт
# не збереться, прод лишиться на старій версії цілком, а не наполовину.
[ "$SERVER_STATE" = changed ] && { tg "🔧 Збираю бекенд..."; build_repo "$SERVER_DIR" server; }
[ "$CLIENT_STATE" = changed ] && { tg "🔧 Збираю фронт..."; build_repo "$CLIENT_DIR" client; }

echo "--- pm2 restart all"
tg "♻️ Збірка пройшла. Перезапускаю pm2..."
pm2 restart all --update-env || fail "pm2 restart впав"

[ "$SERVER_STATE" = changed ] && mark_deployed "$SERVER_DIR" server
[ "$CLIENT_STATE" = changed ] && mark_deployed "$CLIENT_DIR" client

sleep 8
STATUS="$(pm2 jlist 2>/dev/null | grep -o '"status":"[a-z]*"' | sort | uniq -c | tr -s ' ' | tr '\n' ' ')"
NOT_ONLINE="$(pm2 jlist 2>/dev/null | grep -c '"status":"errored"' || true)"

SRV_MSG="без змін"; [ "$SERVER_STATE" = changed ] && SRV_MSG="$(git -C "$SERVER_DIR" log -1 --format='%h %s')"
CLI_MSG="без змін"; [ "$CLIENT_STATE" = changed ] && CLI_MSG="$(git -C "$CLIENT_DIR" log -1 --format='%h %s')"

if [ "${NOT_ONLINE:-0}" -gt 0 ]; then
  tg "⚠️ Деплой завершено, але є процеси в статусі errored

Бекенд: $SRV_MSG
Фронт:  $CLI_MSG
pm2: $STATUS

Перевір: pm2 list, pm2 logs --err --lines 50"
else
  tg "✅ Деплой завершено

Бекенд: $SRV_MSG
Фронт:  $CLI_MSG
pm2: $STATUS"
fi

echo "===== $(date '+%F %T') deploy done ====="
