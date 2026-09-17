#!/usr/bin/env bash
set -euo pipefail

# Ensure Playwright uses preinstalled browsers
export PLAYWRIGHT_BROWSERS_PATH=0

SCRIPT_DIR="/usr/src/microsoft-rewards-script"
DIST_DIR="$SCRIPT_DIR/dist"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Timezone: default to UTC if not provided
# ─────────────────────────────────────────────────────────────────────────────
: "${TZ:=Asia/Shanghai}"
ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime
echo "$TZ" > /etc/timezone
dpkg-reconfigure -f noninteractive tzdata

# ─────────────────────────────────────────────────────────────────────────────
# 2. Validate CRON_SCHEDULE
# ─────────────────────────────────────────────────────────────────────────────
if [ -z "${CRON_SCHEDULE:-}" ]; then
  echo "ERROR: CRON_SCHEDULE environment variable is not set." >&2
  echo "Please set CRON_SCHEDULE (e.g., \"0 2 * * *\")." >&2
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Accounts: generate accounts.json from ACCOUNT_N_* env vars
#
#    Add one numbered block per account in .env, starting at 1:
#      ACCOUNT_1_EMAIL, ACCOUNT_1_PASSWORD, ...
#      ACCOUNT_2_EMAIL, ACCOUNT_2_PASSWORD, ...
# ─────────────────────────────────────────────────────────────────────────────
CONFIG_DIR="$DIST_DIR/config"
mkdir -p "$CONFIG_DIR"

ACCOUNTS_FILE="$CONFIG_DIR/accounts.json"

_build_account_json() {
  local email="$1"
  local password="$2"
  local totp="${3:-}"
  local recovery="${4:-}"
  local geo="${5:-auto}"
  local lang="${6:-en}"
  local proxy_axios="${7:-false}"
  local proxy_url="${8:-}"
  local proxy_port="${9:-0}"
  local proxy_user="${10:-}"
  local proxy_pass="${11:-}"

  jq -n \
    --arg email "$email" \
    --arg password "$password" \
    --arg totp "$totp" \
    --arg recovery "$recovery" \
    --arg geo "$geo" \
    --arg lang "$lang" \
    --argjson proxyAxios "$proxy_axios" \
    --arg proxyUrl "$proxy_url" \
    --argjson proxyPort "$proxy_port" \
    --arg proxyUser "$proxy_user" \
    --arg proxyPass "$proxy_pass" \
    '{
      email: $email,
      password: $password,
      totpSecret: $totp,
      recoveryEmail: $recovery,
      geoLocale: $geo,
      langCode: $lang,
      proxy: {
        proxyAxios: $proxyAxios,
        url: $proxyUrl,
        port: $proxyPort,
        username: $proxyUser,
        password: $proxyPass
      },
      saveFingerprint: {
        mobile: false,
        desktop: false
      }
    }'
}

account_array="[]"
i=1
while true; do
  email_var="ACCOUNT_${i}_EMAIL"
  pass_var="ACCOUNT_${i}_PASSWORD"
  email="${!email_var:-}"
  [ -z "$email" ] && break
  pass="${!pass_var:?ERROR: ${pass_var} must be set when ${email_var} is set}"

  totp_var="ACCOUNT_${i}_TOTP_SECRET";      totp="${!totp_var:-}"
  rec_var="ACCOUNT_${i}_RECOVERY_EMAIL";    rec="${!rec_var:-}"
  geo_var="ACCOUNT_${i}_GEO_LOCALE";        geo="${!geo_var:-auto}"
  lang_var="ACCOUNT_${i}_LANG_CODE";        lang="${!lang_var:-en}"
  paxios_var="ACCOUNT_${i}_PROXY_AXIOS";    paxios="${!paxios_var:-false}"
  purl_var="ACCOUNT_${i}_PROXY_URL";        purl="${!purl_var:-}"
  pport_var="ACCOUNT_${i}_PROXY_PORT";      pport="${!pport_var:-0}"
  puser_var="ACCOUNT_${i}_PROXY_USERNAME";  puser="${!puser_var:-}"
  ppass_var="ACCOUNT_${i}_PROXY_PASSWORD";  ppass="${!ppass_var:-}"

  account_json=$(_build_account_json "$email" "$pass" "$totp" "$rec" "$geo" "$lang" "$paxios" "$purl" "$pport" "$puser" "$ppass")
  account_array=$(echo "$account_array" | jq ". + [$account_json]")
  i=$((i + 1))
done

if [ "$(echo "$account_array" | jq 'length')" -gt 0 ]; then
  echo "$account_array" > "$ACCOUNTS_FILE"
  echo "[entrypoint] accounts.json written with $(echo "$account_array" | jq 'length') account(s)"
elif [ -f "$ACCOUNTS_FILE" ]; then
  echo "[entrypoint] Using mounted accounts.json with $(jq 'length' "$ACCOUNTS_FILE" 2>/dev/null || echo 0) account(s)"
else
  echo "WARNING: No ACCOUNT_1_EMAIL found and no accounts.json mounted — script will likely fail." >&2
  echo "         Set ACCOUNT_1_EMAIL and ACCOUNT_1_PASSWORD in your env, or mount accounts.json." >&2
fi

# ─────────────────────────────────────────────────────────────────────────────
# 4. Config: generate and patch config.json
# ─────────────────────────────────────────────────────────────────────────────
CONFIG_FILE="$CONFIG_DIR/config.json"
CONFIG_EXAMPLE="$SCRIPT_DIR/src/config.example.json"

_config_file_is_valid() {
  [ -f "$CONFIG_FILE" ] && \
  [ "$(wc -c < "$CONFIG_FILE")" -gt 10 ] && \
  jq -e 'type == "object"' "$CONFIG_FILE" > /dev/null 2>&1
}

if ! [ -f "$CONFIG_EXAMPLE" ]; then
  echo "ERROR: config.example.json not found at $CONFIG_EXAMPLE — image may be corrupt." >&2
  exit 1
fi

if _config_file_is_valid; then
  echo "[entrypoint] Using existing config.json."
else
  echo "[entrypoint] No config.json found — generating from config.example.json."
  cp "$CONFIG_EXAMPLE" "$CONFIG_FILE"
  echo "[entrypoint] config.json created."
fi

# Apply CONFIG_* env var overrides
echo "[entrypoint] Applying CONFIG_* environment variable overrides..."
_cfg() {
  local val="$1" path="$2" type="${3:-string}"
  [ -z "$val" ] && return 0
  case "$type" in
    bool|number)
      jq --argjson v "$val" "$path = \$v" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
      ;;
    *)
      jq --arg v "$val" "$path = \$v" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
      ;;
  esac
  echo "[entrypoint]   $path = $val"
}

# headless is always forced true in Docker
_cfg 'true'                            '.headless'                                  bool

_cfg "${CONFIG_CLUSTERS:-}"            '.clusters'                                  number
_cfg "${CONFIG_DEBUG_LOGS:-}"          '.debugLogs'                                 bool
_cfg "${CONFIG_ERROR_DIAGNOSTICS:-}"   '.errorDiagnostics'                          bool
_cfg "${CONFIG_ENSURE_STREAK_PROTECTION:-}"   '.ensureStreakProtection'             bool
_cfg "${CONFIG_GLOBAL_TIMEOUT:-}"      '.globalTimeout'                             string

# Workers
_cfg "${CONFIG_WORKER_DAILY_SET:-}"           '.workers.doDailySet'           bool
_cfg "${CONFIG_WORKER_CLAIM_BONUS_POINTS:-}"  '.workers.doClaimBonusPoints'   bool
_cfg "${CONFIG_WORKER_SPECIAL_PROMOTIONS:-}"  '.workers.doSpecialPromotions'   bool
_cfg "${CONFIG_WORKER_MORE_PROMOTIONS:-}"     '.workers.doMorePromotions'      bool
_cfg "${CONFIG_WORKER_PUNCH_CARDS:-}"         '.workers.doPunchCards'          bool
_cfg "${CONFIG_WORKER_APP_PROMOTIONS:-}"      '.workers.doAppPromotions'       bool
_cfg "${CONFIG_WORKER_DESKTOP_SEARCH:-}"      '.workers.doDesktopSearch'       bool
_cfg "${CONFIG_WORKER_MOBILE_SEARCH:-}"       '.workers.doMobileSearch'        bool
_cfg "${CONFIG_WORKER_DAILY_CHECKIN:-}"       '.workers.doDailyCheckIn'        bool
_cfg "${CONFIG_WORKER_READ_TO_EARN:-}"        '.workers.doReadToEarn'          bool

# Search settings
_cfg "${CONFIG_SEARCH_SCROLL_RANDOM:-}"    '.searchSettings.scrollRandomResults'    bool
_cfg "${CONFIG_SEARCH_CLICK_RANDOM:-}"     '.searchSettings.clickRandomResults'     bool
_cfg "${CONFIG_SEARCH_PARALLEL:-}"         '.searchSettings.parallelSearching'      bool
_cfg "${CONFIG_SEARCH_DELAY_MIN:-}"        '.searchSettings.searchDelay.min'        string
_cfg "${CONFIG_SEARCH_DELAY_MAX:-}"        '.searchSettings.searchDelay.max'        string
_cfg "${CONFIG_SEARCH_READ_DELAY_MIN:-}"   '.searchSettings.readDelay.min'          string
_cfg "${CONFIG_SEARCH_READ_DELAY_MAX:-}"   '.searchSettings.readDelay.max'          string
_cfg "${CONFIG_SEARCH_VISIT_TIME:-}"       '.searchSettings.searchResultVisitTime'  string
_cfg "${CONFIG_SEARCH_ON_BING_LOCAL:-}"    '.searchOnBingLocalQueries'              bool

# Proxy
_cfg "${CONFIG_PROXY_QUERY_ENGINE:-}"  '.proxy.queryEngine'  bool

echo "[entrypoint] Config ready."

# ─────────────────────────────────────────────────────────────────────────────
# 5. Initial run without sleep if RUN_ON_START=true
# ─────────────────────────────────────────────────────────────────────────────
if [ "${RUN_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] Starting initial run in background at $(date)"
  (
    cd "$SCRIPT_DIR" || {
      echo "[entrypoint-bg] ERROR: Unable to cd to $SCRIPT_DIR" >&2
      exit 1
    }
    SKIP_RANDOM_SLEEP=true scripts/docker/run_daily.sh
    echo "[entrypoint-bg] Initial run completed at $(date)"
  ) &
  echo "[entrypoint] Background process started (PID: $!)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 6. Template and register cron file
# ─────────────────────────────────────────────────────────────────────────────
if [ ! -f /etc/cron.d/microsoft-rewards-cron.template ]; then
  echo "ERROR: Cron template /etc/cron.d/microsoft-rewards-cron.template not found." >&2
  exit 1
fi

export TZ
envsubst < /etc/cron.d/microsoft-rewards-cron.template > /etc/cron.d/microsoft-rewards-cron
chmod 0644 /etc/cron.d/microsoft-rewards-cron
crontab /etc/cron.d/microsoft-rewards-cron

echo "[entrypoint] Cron configured with schedule: $CRON_SCHEDULE and timezone: $TZ; starting cron in background"
cron

# ─────────────────────────────────────────────────────────────────────────────
# 7. Start Web UI in foreground (PID 1)
# ─────────────────────────────────────────────────────────────────────────────
WEB_PORT="${WEB_UI_PORT:-3000}"
echo "[entrypoint] Starting Web UI on port $WEB_PORT at $(date)"
exec node "$DIST_DIR/web/server.js"
