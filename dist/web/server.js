"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const package_json_1 = __importDefault(require("../../package.json"));
const Validator_1 = require("../util/Validator");
const DateUtils_1 = require("../util/DateUtils");
const TaskProgressStore_1 = require("../util/TaskProgressStore");
const PointsHistoryStore_1 = require("../util/PointsHistoryStore");
const AccountStatusStore_1 = require("../util/AccountStatusStore");
const RunCheckpointStore_1 = require("../util/RunCheckpointStore");
const WeCom_1 = require("../logging/WeCom");
const logSanitizer_1 = require("./logSanitizer");
const RunAccountRequest_1 = require("../util/RunAccountRequest");
const runtimeRoot = path_1.default.resolve(__dirname, '..');
const appRoot = path_1.default.resolve(__dirname, '..', '..');
const runtimeConfigDir = path_1.default.join(runtimeRoot, 'config');
const legacyAuthFile = path_1.default.join(runtimeRoot, 'web-auth.json');
const defaultAuthFile = path_1.default.join(runtimeConfigDir, 'web-auth.json');
const configuredAuthFile = process.env.WEB_AUTH_FILE?.trim();
const authFile = configuredAuthFile ? path_1.default.resolve(configuredAuthFile) : defaultAuthFile;
const authMirrorFiles = (process.env.WEB_AUTH_MIRROR_FILE ?? '')
    .split(path_1.default.delimiter)
    .map(file => file.trim())
    .filter(Boolean)
    .map(file => path_1.default.resolve(file));
const authReadFiles = Array.from(new Set(configuredAuthFile
    ? [authFile, ...authMirrorFiles]
    : [
        authFile,
        ...authMirrorFiles,
        defaultAuthFile,
        path_1.default.join(appRoot, 'config', 'web-auth.json'),
        legacyAuthFile
    ]));
const accountsFile = path_1.default.join(runtimeRoot, 'accounts.json');
const configFile = path_1.default.join(runtimeRoot, 'config.json');
const scheduleFile = path_1.default.join(runtimeRoot, 'config', 'schedule.json');
const manualRunLogFile = path_1.default.join(appRoot, 'logs', 'manual-run.log');
const runtimeLogFile = process.env.RUNTIME_LOG_FILE?.trim() || '/var/log/microsoft-rewards.log';
const runLockFile = process.env.RUN_LOCK_FILE?.trim() || '/tmp/run_daily.lock';
const runLockMetaFile = process.env.RUN_LOCK_META_FILE?.trim() || '/tmp/run_daily.lock.meta';
const configExampleFile = path_1.default.join(runtimeRoot, 'config.example.json');
const configExampleFallbacks = [
    configExampleFile,
    path_1.default.resolve(process.cwd(), 'src', 'config.example.json'),
    path_1.default.resolve(process.cwd(), 'config.example.json')
];
const sessions = new Map();
let runState = { running: false, lastMessage: '暂无手动运行记录' };
const SESSION_COOKIE = 'mrs_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_RUN_LOG_LINES = 1000;
const MAX_RUN_LOG_BYTES = 2 * 1024 * 1024;
const LOG_LEVELS = new Set(['all', 'error', 'warn', 'info', 'debug']);
function ensureRuntimeFiles() {
    if (!fs_1.default.existsSync(runtimeRoot)) {
        fs_1.default.mkdirSync(runtimeRoot, { recursive: true });
    }
    if (!fs_1.default.existsSync(runtimeConfigDir)) {
        fs_1.default.mkdirSync(runtimeConfigDir, { recursive: true });
    }
    for (const file of [authFile, ...authMirrorFiles]) {
        fs_1.default.mkdirSync(path_1.default.dirname(file), { recursive: true });
    }
    const existingAuthFile = authReadFiles.find(file => fs_1.default.existsSync(file));
    if (existingAuthFile) {
        for (const target of [authFile, ...authMirrorFiles]) {
            if (!fs_1.default.existsSync(target)) {
                fs_1.default.copyFileSync(existingAuthFile, target);
            }
        }
    }
    if (!fs_1.default.existsSync(configFile)) {
        const source = configExampleFallbacks.find(file => fs_1.default.existsSync(file));
        if (!source) {
            throw new Error(`Missing config example. Checked: ${configExampleFallbacks.join(', ')}`);
        }
        fs_1.default.copyFileSync(source, configFile);
    }
    if (!fs_1.default.existsSync(accountsFile)) {
        fs_1.default.writeFileSync(accountsFile, '[]\n', 'utf8');
    }
}
function readJsonFile(file, fallback) {
    try {
        if (!fs_1.default.existsSync(file))
            return fallback;
        return JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
    }
    catch {
        return fallback;
    }
}
function writeJsonFile(file, data) {
    fs_1.default.mkdirSync(path_1.default.dirname(file), { recursive: true });
    fs_1.default.writeFileSync(file, `${JSON.stringify(data, null, 4)}\n`, 'utf8');
}
function writeAuthFile(data) {
    const targets = Array.from(new Set([authFile, ...authMirrorFiles]));
    let lastError = null;
    for (const file of targets) {
        try {
            writeJsonFile(file, data);
        }
        catch (error) {
            lastError = error;
        }
    }
    if (!fs_1.default.existsSync(authFile) && lastError) {
        throw lastError;
    }
}
function currentSchedule() {
    const fallback = process.env.CRON_SCHEDULE ?? '0 7 * * *';
    const saved = readJsonFile(scheduleFile, null);
    return {
        schedule: typeof saved?.schedule === 'string' && saved.schedule ? saved.schedule : fallback,
        timezone: typeof saved?.timezone === 'string' && saved.timezone ? saved.timezone : (process.env.TZ ?? 'UTC'),
        updatedAt: typeof saved?.updatedAt === 'string' ? saved.updatedAt : ''
    };
}
function validateCronSchedule(schedule) {
    const trimmed = schedule.trim().replace(/\s+/g, ' ');
    if (trimmed.split(' ').length !== 5) {
        throw new Error('定时表达式必须是 5 段，例如 0 7 * * *');
    }
    if (/(^|\s)(@|[A-Za-z]|;|&&|\|\||`|\$|\(|\)|<|>)/.test(trimmed)) {
        throw new Error('定时表达式包含不支持的字符');
    }
}
function saveSchedule(schedule) {
    const trimmed = schedule.trim().replace(/\s+/g, ' ');
    validateCronSchedule(trimmed);
    const script = path_1.default.join(appRoot, 'scripts', 'docker', 'schedule.sh');
    if (process.platform === 'linux' &&
        fs_1.default.existsSync(script) &&
        fs_1.default.existsSync('/etc/cron.d/microsoft-rewards-cron.template')) {
        const result = (0, child_process_1.spawnSync)('bash', [script, 'apply', trimmed], {
            cwd: appRoot,
            env: { ...process.env, CRON_SCHEDULE: trimmed, TZ: process.env.TZ ?? 'UTC' },
            encoding: 'utf8'
        });
        if (result.status !== 0) {
            throw new Error(result.stderr.trim() || result.stdout.trim() || '更新 cron 失败');
        }
    }
    const next = {
        schedule: trimmed,
        timezone: process.env.TZ ?? 'UTC',
        updatedAt: new Date().toISOString()
    };
    writeJsonFile(scheduleFile, next);
    process.env.CRON_SCHEDULE = trimmed;
    return next;
}
function redactLogLine(line) {
    return (0, logSanitizer_1.stampLogLine)((0, logSanitizer_1.readableLogSnippet)(line))
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, email => maskEmail(email))
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [REDACTED]')
        .replace(/([?&](?:code|access_token|id_token|refresh_token|request_token|client_secret|RequestVerificationToken)=)[^&\s|]+/gi, '$1[REDACTED]')
        .replace(/\b(password|passwd|pwd|token|secret|cookie|authorization|corpsecret|client_secret)(\s*[:=]\s*)([^\s|]+)/gi, '$1$2[REDACTED]')
        .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP-REDACTED]')
        .replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[TOKEN-REDACTED]');
}
function appendManualRunLog(lines) {
    if (lines.length === 0)
        return;
    try {
        fs_1.default.mkdirSync(path_1.default.dirname(manualRunLogFile), { recursive: true });
        const content = `${lines.join('\n')}\n`;
        fs_1.default.appendFileSync(manualRunLogFile, content, 'utf8');
        fs_1.default.appendFileSync(datedManualRunLogFile(), content, 'utf8');
    }
    catch { }
}
function collectRunOutput(chunk, stream) {
    const lines = chunk
        .toString()
        .split(/\r?\n/)
        .map(redactLogLine)
        .map(line => line.trimEnd())
        .filter(line => line.trim().length > 0);
    if (lines.length === 0)
        return;
    const now = new Date();
    const stamped = lines.map(line => (0, logSanitizer_1.stampLogLine)(line, now));
    runState = {
        ...runState,
        lastMessage: stamped[stamped.length - 1] ?? runState.lastMessage,
        recentLog: [...(runState.recentLog ?? []), ...stamped].slice(-MAX_RUN_LOG_LINES)
    };
    appendManualRunLog(stamped);
    for (const line of stamped) {
        stream.write(`${line}\n`);
    }
}
function startScriptRun(mode, options = {}) {
    if (runState.running) {
        return runState;
    }
    const script = path_1.default.join(appRoot, 'scripts', 'docker', 'run_daily.sh');
    if (!fs_1.default.existsSync(script)) {
        throw new Error('找不到运行脚本 scripts/docker/run_daily.sh');
    }
    const accountMode = mode === 'account-check' ? 'all' : (options.accountMode ?? 'continue');
    const accountIndex = accountMode === 'account' ? options.accountIndex : undefined;
    const manualTask = mode === 'task' ? options.manualTask : undefined;
    const accounts = loadAccounts();
    (0, RunCheckpointStore_1.validateRunAccountIndex)(accounts.length, accountMode, accountIndex);
    const selectedAccount = accountIndex ? accounts[accountIndex - 1] : undefined;
    const accountLabel = selectedAccount ? `#${accountIndex} ${maskEmail(selectedAccount.email)}` : undefined;
    const checkpointStates = new Map((0, RunCheckpointStore_1.readRunCheckpointFile)().accounts.map(item => [item.accountHash, item.state]));
    const selectedCount = accountMode === 'account'
        ? 1
        : accountMode === 'continue'
            ? accounts.filter(account => checkpointStates.get((0, TaskProgressStore_1.accountProgressHash)(account.email)) !== 'completed')
                .length
            : accountMode === 'failed'
                ? accounts.filter(account => ['failed', 'interrupted'].includes(checkpointStates.get((0, TaskProgressStore_1.accountProgressHash)(account.email)) ?? 'pending')).length
                : accounts.length;
    const runSource = options.source ?? 'web';
    const child = (0, child_process_1.spawn)('bash', [script], {
        cwd: appRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            SKIP_RANDOM_SLEEP: 'true',
            RUN_SOURCE: runSource,
            RUN_MODE: mode,
            ...(0, RunAccountRequest_1.buildRunAccountEnvironment)(accountMode, accountIndex),
            ...(manualTask ? { MANUAL_TASK: manualTask } : {}),
            RUN_FAIL_ON_LOCK: 'true',
            RUNTIME_LOG_FILE: runtimeLogFile,
            ...(mode === 'account-check' ? { ACCOUNT_STATUS_CHECK_ONLY: 'true' } : {})
        }
    });
    const label = mode === 'account-check'
        ? '账号状态检测'
        : manualTask
            ? `${manualTaskLabel(manualTask)}（${accountModeLabel(accountMode)}）`
            : runSource === 'cron'
                ? `定时任务（${accountModeLabel(accountMode)}）`
                : `手动运行（${accountModeLabel(accountMode)}）`;
    const selectionText = accountLabel
        ? ` | 实际选择: ${accountLabel} | 数量 ${selectedCount}/${accounts.length}`
        : ` | 账号数量 ${selectedCount}/${accounts.length}`;
    const startedLine = (0, logSanitizer_1.stampLogLine)(`${label}已启动，PID ${child.pid}${selectionText}`);
    runState = {
        running: true,
        source: runSource,
        mode,
        accountMode,
        accountIndex,
        accountLabel,
        selectedCount,
        totalAccounts: accounts.length,
        manualTask,
        pid: child.pid,
        startedAt: new Date().toISOString(),
        exitCode: null,
        lastMessage: `${label}已启动，PID ${child.pid}${selectionText}`,
        recentLog: [startedLine]
    };
    appendManualRunLog([startedLine]);
    child.stdout?.on('data', chunk => collectRunOutput(chunk, process.stdout));
    child.stderr?.on('data', chunk => collectRunOutput(chunk, process.stderr));
    child.on('error', error => {
        const message = `${label}启动失败：${error.message}`;
        runState = {
            ...runState,
            running: false,
            finishedAt: new Date().toISOString(),
            exitCode: -1,
            lastMessage: message,
            recentLog: [...(runState.recentLog ?? []), (0, logSanitizer_1.stampLogLine)(message)].slice(-MAX_RUN_LOG_LINES)
        };
        appendManualRunLog([(0, logSanitizer_1.stampLogLine)(message)]);
    });
    child.on('close', (code, signal) => {
        const message = code === 0 && !signal
            ? `${label}已完成`
            : `${label}结束，退出码 ${code ?? 'n/a'}${signal ? `，信号 ${signal}` : ''}`;
        runState = {
            ...runState,
            running: false,
            finishedAt: new Date().toISOString(),
            exitCode: code,
            lastMessage: message,
            recentLog: [...(runState.recentLog ?? []), (0, logSanitizer_1.stampLogLine)(message)].slice(-MAX_RUN_LOG_LINES)
        };
        appendManualRunLog([(0, logSanitizer_1.stampLogLine)(message)]);
    });
    return runState;
}
function hashPassword(password, salt = crypto_1.default.randomBytes(16).toString('hex')) {
    const iterations = 120000;
    const passwordHash = crypto_1.default.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
    const now = new Date().toISOString();
    return {
        username: '',
        salt,
        passwordHash,
        iterations,
        createdAt: now,
        updatedAt: now
    };
}
function verifyPassword(password, auth) {
    const actual = crypto_1.default.pbkdf2Sync(password, auth.salt, auth.iterations, 32, 'sha256');
    const expected = Buffer.from(auth.passwordHash, 'hex');
    return actual.length === expected.length && crypto_1.default.timingSafeEqual(actual, expected);
}
function getConfiguredAuth() {
    const envUser = process.env.WEB_ADMIN_USER?.trim();
    const envPassword = process.env.WEB_ADMIN_PASSWORD;
    if (envUser && envPassword) {
        return {
            ...hashPassword(envPassword),
            username: envUser,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }
    const file = authReadFiles.find(candidate => fs_1.default.existsSync(candidate));
    if (!file)
        return null;
    return readJsonFile(file, null);
}
function createSession(username) {
    const id = crypto_1.default.randomBytes(32).toString('hex');
    sessions.set(id, { username, expiresAt: Date.now() + SESSION_TTL_MS });
    return id;
}
function cookieHeader(name, value, maxAge) {
    const pieces = [`${name}=${value}`, 'HttpOnly', 'Path=/', 'SameSite=Lax'];
    if (maxAge !== undefined)
        pieces.push(`Max-Age=${maxAge}`);
    return pieces.join('; ');
}
function parseCookies(req) {
    const out = {};
    const cookie = req.headers.cookie;
    if (!cookie)
        return out;
    for (const item of cookie.split(';')) {
        const [rawName, ...rawValue] = item.trim().split('=');
        if (!rawName)
            continue;
        out[rawName] = decodeURIComponent(rawValue.join('='));
    }
    return out;
}
function getSession(req) {
    const id = parseCookies(req)[SESSION_COOKIE];
    if (!id)
        return null;
    const session = sessions.get(id);
    if (!session)
        return null;
    if (session.expiresAt < Date.now()) {
        sessions.delete(id);
        return null;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return session;
}
function maskEmail(email) {
    const [name = '', domain = ''] = email.split('@');
    if (!domain)
        return email ? `${email.slice(0, 2)}***` : '';
    const left = name.length <= 2 ? `${name[0] ?? ''}***` : `${name.slice(0, 2)}***${name.slice(-1)}`;
    return `${left}@${domain}`;
}
function datedManualRunLogFile(date = (0, DateUtils_1.localDateKey)()) {
    return path_1.default.join(appRoot, 'logs', `manual-run-${date}.log`);
}
function readTextFileTail(file, maxBytes = MAX_RUN_LOG_BYTES) {
    if (!fs_1.default.existsSync(file))
        return '';
    const stat = fs_1.default.statSync(file);
    if (!stat.isFile() || stat.size <= 0)
        return '';
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;
    const fd = fs_1.default.openSync(file, 'r');
    try {
        const buffer = Buffer.alloc(length);
        fs_1.default.readSync(fd, buffer, 0, buffer.length, start);
        return buffer.toString('utf8');
    }
    finally {
        fs_1.default.closeSync(fd);
    }
}
function numericPid(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
}
function positiveInteger(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
}
function normalizeRunAccountMode(value) {
    switch (String(value ?? '')
        .trim()
        .toLowerCase()) {
        case 'failed':
            return 'failed';
        case 'all':
            return 'all';
        case 'account':
            return 'account';
        case 'continue':
        case '':
            return 'continue';
        default:
            return 'continue';
    }
}
function normalizeManualTask(value) {
    switch (String(value ?? '')
        .trim()
        .toLowerCase()) {
        case 'claim-bonus-points':
            return 'claim-bonus-points';
        case '':
        case 'undefined':
            return undefined;
        default:
            throw new Error('未知手动任务类型');
    }
}
function readPidFile(file) {
    try {
        const raw = fs_1.default.readFileSync(file, 'utf8').trim();
        return /^\d+$/.test(raw) ? Number(raw) : undefined;
    }
    catch {
        return undefined;
    }
}
function processAlive(pid) {
    if (!pid)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function readRunLockMeta() {
    const meta = readJsonFile(runLockMetaFile, null);
    if (!meta)
        return null;
    const source = meta.source === 'cron' || meta.source === 'web' || meta.source === 'startup' ? meta.source : 'unknown';
    const mode = meta.mode === 'account-check' ? 'account-check' : 'task';
    return {
        pid: numericPid(meta.pid),
        source,
        mode,
        accountMode: normalizeRunAccountMode(meta.accountMode),
        manualTask: typeof meta.manualTask === 'string' ? meta.manualTask : undefined,
        accountIndex: typeof meta.accountIndex === 'string' ? meta.accountIndex : undefined,
        startedAt: typeof meta.startedAt === 'string' ? meta.startedAt : undefined,
        skipRandomSleep: typeof meta.skipRandomSleep === 'string' ? meta.skipRandomSleep : undefined,
        logFile: typeof meta.logFile === 'string' ? meta.logFile : undefined
    };
}
function ageSeconds(startedAt) {
    if (!startedAt)
        return undefined;
    const ts = Date.parse(startedAt);
    if (!Number.isFinite(ts))
        return undefined;
    return Math.max(0, Math.floor((Date.now() - ts) / 1000));
}
function mergedRunState() {
    const lockPid = readPidFile(runLockFile);
    const meta = readRunLockMeta();
    const pid = lockPid ?? meta?.pid ?? runState.pid;
    const lockOwnerAlive = processAlive(pid);
    const locked = Boolean(lockPid);
    const externalRunning = Boolean(locked && lockOwnerAlive);
    const running = Boolean(runState.running || externalRunning);
    const startedAt = meta?.startedAt ?? runState.startedAt;
    const source = meta?.source ?? runState.source ?? (externalRunning ? 'unknown' : undefined);
    const mode = meta?.mode ?? runState.mode;
    const accountMode = meta?.accountMode ?? runState.accountMode;
    const manualTask = normalizeManualTask(meta?.manualTask ?? runState.manualTask);
    const accountIndex = positiveInteger(meta?.accountIndex) ?? runState.accountIndex;
    const conflictReason = running
        ? `已有${sourceLabel(source)}${modeLabel(mode)}正在运行${pid ? `，PID ${pid}` : ''}`
        : undefined;
    return {
        ...runState,
        running,
        source,
        mode,
        accountMode,
        manualTask,
        accountIndex,
        pid,
        startedAt,
        ageSeconds: ageSeconds(startedAt),
        lockFile: runLockFile,
        lockOwnerAlive,
        conflictReason,
        lastMessage: running && conflictReason && (!runState.lastMessage || runState.lastMessage === '暂无手动运行记录')
            ? conflictReason
            : runState.lastMessage,
        recentLog: runState.recentLog
    };
}
function sourceLabel(source) {
    switch (source) {
        case 'cron':
            return '定时任务';
        case 'web':
            return 'Web手动';
        case 'startup':
            return '启动任务';
        default:
            return '任务';
    }
}
function modeLabel(mode) {
    return mode === 'account-check' ? '账号检测' : '执行任务';
}
function manualTaskLabel(task) {
    switch (task) {
        case 'claim-bonus-points':
            return '立即领取奖励积分';
        default:
            return '手动任务';
    }
}
function accountModeLabel(mode) {
    switch (mode) {
        case 'failed':
            return '只重跑失败账号';
        case 'all':
            return '强制全量重跑';
        case 'account':
            return '重跑指定账号';
        case 'continue':
        default:
            return '继续未完成账号';
    }
}
function accountStatusLabel(state) {
    switch (state) {
        case 'checking':
            return '检测中';
        case 'valid':
            return '账号有效';
        case 'running':
            return '执行中';
        case 'success':
            return '正常';
        case 'error':
            return '异常';
        default:
            return '未检测';
    }
}
function checkpointLabel(state) {
    switch (state) {
        case 'pending':
            return '等待执行';
        case 'running':
            return '执行中';
        case 'completed':
            return '今日已完成';
        case 'failed':
            return '失败待重跑';
        case 'interrupted':
            return '中断待续跑';
        case 'skipped':
            return '已跳过';
        default:
            return '无记录';
    }
}
function getRunCheckpoint(account) {
    const saved = (0, RunCheckpointStore_1.readRunCheckpointFile)().accounts.find(item => item.accountHash === (0, TaskProgressStore_1.accountProgressHash)(account.email));
    const state = saved?.state ?? 'unknown';
    return {
        state,
        label: checkpointLabel(state),
        currentTask: saved?.currentTask ?? '',
        currentStep: saved?.currentStep ?? '',
        lastMessage: saved?.lastMessage ?? '今天尚未运行',
        updatedAt: saved?.updatedAt ?? '',
        startedAt: saved?.startedAt ?? '',
        finishedAt: saved?.finishedAt ?? '',
        runMode: saved?.runMode ?? ''
    };
}
function getAccountStatus(account) {
    const saved = (0, AccountStatusStore_1.readAccountStatusFile)().accounts.find(item => item.accountHash === (0, TaskProgressStore_1.accountProgressHash)(account.email));
    const state = saved?.state ?? 'unknown';
    return {
        state,
        label: accountStatusLabel(state),
        stage: saved?.stage ?? '',
        lastMessage: saved?.lastMessage ?? '尚未检测',
        updatedAt: saved?.updatedAt ?? '',
        lastCheckedAt: saved?.lastCheckedAt ?? '',
        lastSuccessAt: saved?.lastSuccessAt ?? '',
        lastFailureAt: saved?.lastFailureAt ?? ''
    };
}
function sanitizeAccount(account, id) {
    const status = getAccountStatus(account);
    const checkpoint = getRunCheckpoint(account);
    return {
        id,
        runAccountIndex: id + 1,
        maskedEmail: maskEmail(account.email),
        geoLocale: account.geoLocale,
        langCode: account.langCode,
        hasPassword: Boolean(account.password),
        hasTotpSecret: Boolean(account.totpSecret),
        hasRecoveryEmail: Boolean(account.recoveryEmail),
        proxyEnabled: Boolean(account.proxy?.url),
        proxyAxios: Boolean(account.proxy?.proxyAxios),
        proxyHost: account.proxy?.url ?? '',
        proxyPort: account.proxy?.port ?? 0,
        proxyUsername: account.proxy?.username ?? '',
        saveFingerprint: {
            mobile: Boolean(account.saveFingerprint?.mobile),
            desktop: Boolean(account.saveFingerprint?.desktop)
        },
        status,
        checkpoint
    };
}
function pointsCalendarAccounts(accounts) {
    return accounts.map((account, index) => ({
        id: (0, TaskProgressStore_1.accountProgressHash)(account.email),
        accountHash: (0, TaskProgressStore_1.accountProgressHash)(account.email),
        label: `账号 ${index + 1} · ${maskEmail(account.email) || '未填写邮箱'}`
    }));
}
function normalizePointsRangePreset(value) {
    if (value === 'week' || value === 'month' || value === 'quarter' || value === 'year' || value === 'custom') {
        return value;
    }
    return 'month';
}
function todayDateKey() {
    return (0, DateUtils_1.localDateKey)();
}
function pointTodaySummary(accounts) {
    const today = todayDateKey();
    const result = (0, PointsHistoryStore_1.queryPointsCalendar)(pointsCalendarAccounts(accounts), {
        account: 'all',
        range: 'custom',
        start: today,
        end: today
    });
    const summary = {};
    for (const record of result.records) {
        summary[record.accountId] = {
            todayGained: Math.max(0, Number(record.todayGained || 0)),
            runGained: Math.max(0, Number(record.runGained || 0))
        };
    }
    return summary;
}
function loadAccounts() {
    const raw = readJsonFile(accountsFile, []);
    if (!Array.isArray(raw))
        return [];
    const result = raw.map(item => Validator_1.AccountSchema.safeParse(item));
    return result.filter(item => item.success).map(item => item.data);
}
function saveAccounts(accounts) {
    const parsed = accounts.map(account => Validator_1.AccountSchema.parse(account));
    writeJsonFile(accountsFile, parsed);
}
function loadConfig() {
    const raw = readJsonFile(configFile, {});
    return (0, Validator_1.validateConfig)(raw);
}
function saveConfig(config) {
    writeJsonFile(configFile, Validator_1.ConfigSchema.parse(config));
}
function publicWeComConfig(config) {
    const wecom = config.webhook.wecom;
    return {
        enabled: Boolean(wecom?.enabled),
        corpId: wecom?.corpId ?? '',
        agentId: String(wecom?.agentId ?? ''),
        hasCorpSecret: Boolean(wecom?.corpSecret),
        toUser: wecom?.toUser ?? '',
        proxyMode: wecom?.proxyMode === 'qinglong' ? 'qinglong' : 'direct',
        proxyBaseUrl: wecom?.proxyBaseUrl ?? ''
    };
}
function publicGiftCardMonitorConfig(config) {
    const monitor = config.giftCardMonitor;
    return {
        enabled: Boolean(monitor?.enabled),
        keywords: Array.isArray(monitor?.keywords) ? monitor.keywords : [],
        requireEnoughPoints: Boolean(monitor?.requireEnoughPoints),
        notifyOnce: monitor?.notifyOnce !== false,
        shopUrl: monitor?.shopUrl || 'https://rewards.bing.com/redeem/cn?section=shop'
    };
}
function publicConfig(config) {
    return {
        headless: config.headless,
        clusters: config.clusters,
        debugLogs: config.debugLogs,
        errorDiagnostics: config.errorDiagnostics,
        ensureStreakProtection: config.ensureStreakProtection,
        workers: config.workers,
        searchOnBingLocalQueries: config.searchOnBingLocalQueries,
        globalTimeout: config.globalTimeout,
        searchSettings: {
            scrollRandomResults: config.searchSettings.scrollRandomResults,
            clickRandomResults: config.searchSettings.clickRandomResults,
            parallelSearching: config.searchSettings.parallelSearching,
            queryEngines: config.searchSettings.queryEngines,
            searchResultVisitTime: config.searchSettings.searchResultVisitTime,
            searchDelay: config.searchSettings.searchDelay,
            readDelay: config.searchSettings.readDelay
        },
        giftCardMonitor: publicGiftCardMonitorConfig(config)
    };
}
function wecomFromPayload(input, existing) {
    const corpSecretInput = typeof input.corpSecret === 'string' ? input.corpSecret : '';
    const proxyMode = input.proxyMode === 'qinglong' ? 'qinglong' : 'direct';
    return {
        enabled: Boolean(input.enabled),
        corpId: String(input.corpId ?? existing?.corpId ?? '').trim(),
        agentId: String(input.agentId ?? existing?.agentId ?? '').trim(),
        corpSecret: corpSecretInput.trim().length > 0 ? corpSecretInput.trim() : (existing?.corpSecret ?? ''),
        toUser: String(input.toUser ?? existing?.toUser ?? '').trim(),
        proxyMode,
        proxyBaseUrl: String(input.proxyBaseUrl ?? existing?.proxyBaseUrl ?? '').trim()
    };
}
function validateWeComForSave(wecom) {
    if (!wecom.enabled)
        return [];
    const missing = [];
    if (!wecom.corpId.trim())
        missing.push('corpid');
    if (!/^\d+$/.test(String(wecom.agentId).trim()))
        missing.push('agentid');
    if (!wecom.corpSecret.trim())
        missing.push('corpsecret');
    if (!wecom.toUser.trim())
        missing.push('touser');
    return missing;
}
function defaultAccount() {
    return {
        email: '',
        password: '',
        totpSecret: '',
        recoveryEmail: '',
        geoLocale: 'auto',
        langCode: 'zh',
        proxy: {
            proxyAxios: false,
            url: '',
            port: 0,
            username: '',
            password: ''
        },
        saveFingerprint: {
            mobile: true,
            desktop: true
        }
    };
}
function accountFromPayload(input, existing) {
    const base = existing ?? defaultAccount();
    const password = typeof input.password === 'string' && input.password.length > 0 ? input.password : base.password;
    const email = String(input.email ?? '').trim() || base.email;
    const account = {
        email,
        password,
        totpSecret: String(input.totpSecret ?? base.totpSecret ?? '').trim(),
        recoveryEmail: String(input.recoveryEmail ?? base.recoveryEmail ?? '').trim(),
        geoLocale: String(input.geoLocale ?? base.geoLocale ?? 'auto').trim() || 'auto',
        langCode: String(input.langCode ?? base.langCode ?? 'zh').trim() || 'zh',
        proxy: {
            proxyAxios: Boolean(input.proxyAxios ?? base.proxy.proxyAxios),
            url: String(input.proxyUrl ?? base.proxy.url ?? '').trim(),
            port: Number(input.proxyPort ?? base.proxy.port ?? 0),
            username: String(input.proxyUsername ?? base.proxy.username ?? '').trim(),
            password: typeof input.proxyPassword === 'string' && input.proxyPassword.length > 0
                ? input.proxyPassword
                : base.proxy.password
        },
        saveFingerprint: {
            mobile: Boolean(input.saveFingerprintMobile ?? base.saveFingerprint.mobile),
            desktop: Boolean(input.saveFingerprintDesktop ?? base.saveFingerprint.desktop)
        }
    };
    Validator_1.AccountSchema.parse(account);
    return account;
}
function safeConfigPatch(config, input) {
    const workers = input.workers && typeof input.workers === 'object' ? input.workers : {};
    const nextWorkers = { ...config.workers };
    for (const key of Object.keys(nextWorkers)) {
        if (key in workers) {
            nextWorkers[key] = Boolean(workers[key]);
        }
    }
    const keywordsInput = typeof input.giftCardKeywords === 'string'
        ? input.giftCardKeywords
        : Array.isArray(input.giftCardKeywords)
            ? input.giftCardKeywords.join('\n')
            : config.giftCardMonitor.keywords.join('\n');
    const giftCardMonitor = {
        ...config.giftCardMonitor,
        enabled: 'giftCardMonitorEnabled' in input
            ? Boolean(input.giftCardMonitorEnabled)
            : Boolean(config.giftCardMonitor.enabled),
        keywords: String(keywordsInput)
            .split(/\r?\n|,/)
            .map(keyword => keyword.trim())
            .filter(Boolean),
        requireEnoughPoints: 'giftCardRequireEnoughPoints' in input
            ? Boolean(input.giftCardRequireEnoughPoints)
            : Boolean(config.giftCardMonitor.requireEnoughPoints),
        notifyOnce: 'giftCardNotifyOnce' in input
            ? Boolean(input.giftCardNotifyOnce)
            : config.giftCardMonitor.notifyOnce !== false,
        shopUrl: String(input.giftCardShopUrl ?? config.giftCardMonitor.shopUrl ?? '').trim() ||
            'https://rewards.bing.com/redeem/cn?section=shop'
    };
    const updated = {
        ...config,
        clusters: Number(input.clusters ?? config.clusters),
        debugLogs: Boolean(input.debugLogs ?? config.debugLogs),
        errorDiagnostics: Boolean(input.errorDiagnostics ?? config.errorDiagnostics),
        ensureStreakProtection: Boolean(input.ensureStreakProtection ?? config.ensureStreakProtection),
        globalTimeout: String(input.globalTimeout ?? config.globalTimeout),
        searchOnBingLocalQueries: Boolean(input.searchOnBingLocalQueries ?? config.searchOnBingLocalQueries),
        workers: nextWorkers,
        giftCardMonitor,
        searchSettings: {
            ...config.searchSettings,
            scrollRandomResults: Boolean(input.scrollRandomResults ?? config.searchSettings.scrollRandomResults),
            clickRandomResults: Boolean(input.clickRandomResults ?? config.searchSettings.clickRandomResults),
            parallelSearching: Boolean(input.parallelSearching ?? config.searchSettings.parallelSearching),
            searchResultVisitTime: String(input.searchResultVisitTime ?? config.searchSettings.searchResultVisitTime),
            searchDelay: {
                min: String(input.searchDelayMin ?? config.searchSettings.searchDelay.min),
                max: String(input.searchDelayMax ?? config.searchSettings.searchDelay.max)
            },
            readDelay: {
                min: String(input.readDelayMin ?? config.searchSettings.readDelay.min),
                max: String(input.readDelayMax ?? config.searchSettings.readDelay.max)
            }
        }
    };
    return Validator_1.ConfigSchema.parse(updated);
}
function send(res, status, body, contentType = 'text/html; charset=utf-8') {
    res.writeHead(status, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
    });
    res.end(body);
}
function sendJson(res, status, payload) {
    send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8');
}
function notFound(res) {
    sendJson(res, 404, { error: 'NOT_FOUND' });
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('REQUEST_TOO_LARGE'));
                req.destroy();
                return;
            }
            chunks.push(Buffer.from(chunk));
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw.trim()) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            }
            catch {
                reject(new Error('INVALID_JSON'));
            }
        });
        req.on('error', reject);
    });
}
function requireAuth(req, res) {
    const session = getSession(req);
    if (!session) {
        sendJson(res, 401, { error: 'UNAUTHENTICATED' });
        return null;
    }
    return session;
}
async function handleApi(req, res, url) {
    const auth = getConfiguredAuth();
    if (url.pathname === '/api/bootstrap' && req.method === 'GET') {
        sendJson(res, 200, {
            setupRequired: !auth,
            authenticated: Boolean(getSession(req)),
            version: package_json_1.default.version,
            port: Number(process.env.WEB_UI_PORT ?? process.env.PORT ?? 3000)
        });
        return;
    }
    if (url.pathname === '/api/setup' && req.method === 'POST') {
        if (auth) {
            sendJson(res, 409, { error: 'SETUP_ALREADY_DONE' });
            return;
        }
        const body = (await readBody(req));
        const username = String(body.username ?? '').trim();
        const password = String(body.password ?? '');
        const passwordConfirm = String(body.passwordConfirm ?? '');
        if (username.length < 3 || password.length < 8) {
            sendJson(res, 400, { error: 'INVALID_SETUP', message: '用户名至少 3 位，密码至少 8 位' });
            return;
        }
        if (password !== passwordConfirm) {
            sendJson(res, 400, { error: 'PASSWORD_MISMATCH', message: '两次输入的管理员密码不一致' });
            return;
        }
        const nextAuth = hashPassword(password);
        nextAuth.username = username;
        writeAuthFile(nextAuth);
        const sessionId = createSession(username);
        res.setHeader('Set-Cookie', cookieHeader(SESSION_COOKIE, sessionId, SESSION_TTL_MS / 1000));
        sendJson(res, 200, { ok: true });
        return;
    }
    if (url.pathname === '/api/login' && req.method === 'POST') {
        if (!auth) {
            sendJson(res, 428, { error: 'SETUP_REQUIRED' });
            return;
        }
        const body = (await readBody(req));
        const username = String(body.username ?? '').trim();
        const password = String(body.password ?? '');
        if (username !== auth.username || !verifyPassword(password, auth)) {
            sendJson(res, 401, { error: 'LOGIN_FAILED' });
            return;
        }
        const sessionId = createSession(username);
        res.setHeader('Set-Cookie', cookieHeader(SESSION_COOKIE, sessionId, SESSION_TTL_MS / 1000));
        sendJson(res, 200, { ok: true });
        return;
    }
    if (url.pathname === '/api/logout' && req.method === 'POST') {
        const sessionId = parseCookies(req)[SESSION_COOKIE];
        if (sessionId)
            sessions.delete(sessionId);
        res.setHeader('Set-Cookie', cookieHeader(SESSION_COOKIE, '', 0));
        sendJson(res, 200, { ok: true });
        return;
    }
    const session = requireAuth(req, res);
    if (!session)
        return;
    if (url.pathname === '/api/state' && req.method === 'GET') {
        const accounts = loadAccounts();
        const config = loadConfig();
        const workersEnabled = Object.values(config.workers).filter(Boolean).length;
        const currentRunState = mergedRunState();
        const taskProgress = parseTaskProgress(accounts);
        sendJson(res, 200, {
            user: { username: session.username },
            runtime: {
                version: package_json_1.default.version,
                root: runtimeRoot,
                webPort: Number(process.env.WEB_UI_PORT ?? process.env.PORT ?? 3000),
                nodeEnv: process.env.NODE_ENV ?? 'development'
            },
            stats: {
                accounts: accounts.length,
                workersEnabled,
                clusters: config.clusters,
                headless: config.headless,
                schedule: currentSchedule().schedule,
                lastRun: readLastRunSummary()
            },
            accounts: accounts.map(sanitizeAccount),
            pointToday: pointTodaySummary(accounts),
            taskProgress,
            taskEvents: buildTaskEvents(taskProgress),
            config: publicConfig(config),
            wecom: publicWeComConfig(config),
            schedule: currentSchedule(),
            runState: currentRunState
        });
        return;
    }
    if (url.pathname === '/api/run' && req.method === 'POST') {
        try {
            const currentRunState = mergedRunState();
            if (currentRunState.running) {
                sendJson(res, 409, {
                    error: 'RUN_ALREADY_ACTIVE',
                    message: currentRunState.conflictReason ?? '已有任务正在运行',
                    runState: currentRunState
                });
                return;
            }
            const body = (await readBody(req));
            const accounts = loadAccounts();
            const { accountMode, accountIndex } = (0, RunAccountRequest_1.resolveRunAccountRequest)(normalizeRunAccountMode(body.accountMode), body.accountIndex, accounts.length);
            const manualTask = normalizeManualTask(body.manualTask);
            sendJson(res, 200, {
                ok: true,
                runState: startScriptRun('task', { accountMode, accountIndex, manualTask })
            });
        }
        catch (error) {
            sendJson(res, 400, {
                error: 'RUN_FAILED',
                message: error instanceof Error ? error.message : String(error)
            });
        }
        return;
    }
    if (url.pathname === '/api/account-status/check' && req.method === 'POST') {
        try {
            const currentRunState = mergedRunState();
            if (currentRunState.running) {
                sendJson(res, 409, {
                    error: 'RUN_ALREADY_ACTIVE',
                    message: currentRunState.conflictReason ?? '已有任务正在运行',
                    runState: currentRunState
                });
                return;
            }
            sendJson(res, 200, { ok: true, runState: startScriptRun('account-check') });
        }
        catch (error) {
            sendJson(res, 400, {
                error: 'ACCOUNT_CHECK_FAILED',
                message: error instanceof Error ? error.message : String(error)
            });
        }
        return;
    }
    if (url.pathname === '/api/logs' && req.method === 'GET') {
        const result = queryLogs(url);
        sendJson(res, 200, {
            ok: true,
            source: result.source,
            level: result.level,
            query: result.query,
            tail: result.tail,
            count: result.lines.length,
            lines: result.lines
        });
        return;
    }
    if (url.pathname === '/api/logs/download' && req.method === 'GET') {
        const result = queryLogs(url);
        const filename = `mrs-${result.source}-redacted-${(0, DateUtils_1.localDateKey)()}.log`;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.end(result.lines.map(line => line.text).join('\n'));
        return;
    }
    if (url.pathname === '/api/points-calendar' && req.method === 'GET') {
        const accounts = loadAccounts();
        const result = (0, PointsHistoryStore_1.queryPointsCalendar)(pointsCalendarAccounts(accounts), {
            account: url.searchParams.get('account') ?? 'all',
            range: normalizePointsRangePreset(url.searchParams.get('range')),
            start: url.searchParams.get('start') ?? undefined,
            end: url.searchParams.get('end') ?? undefined
        });
        sendJson(res, 200, { ok: true, ...result });
        return;
    }
    if (url.pathname === '/api/schedule' && req.method === 'POST') {
        const body = (await readBody(req));
        const schedule = String(body.schedule ?? '');
        try {
            const next = saveSchedule(schedule);
            sendJson(res, 200, { ok: true, schedule: next });
        }
        catch (error) {
            sendJson(res, 400, {
                error: 'INVALID_SCHEDULE',
                message: error instanceof Error ? error.message : String(error)
            });
        }
        return;
    }
    if (url.pathname === '/api/accounts' && req.method === 'POST') {
        const body = (await readBody(req));
        const accounts = loadAccounts();
        const id = Number(body.id ?? -1);
        const next = accountFromPayload(body, id >= 0 ? accounts[id] : undefined);
        if (id >= 0 && id < accounts.length) {
            accounts[id] = next;
        }
        else {
            accounts.push(next);
        }
        saveAccounts(accounts);
        (0, AccountStatusStore_1.updateAccountStatus)(next.email, {
            state: 'unknown',
            stage: 'account-config',
            lastMessage: '账号配置已更新，等待重新检测'
        });
        sendJson(res, 200, { ok: true, accounts: accounts.map(sanitizeAccount) });
        return;
    }
    const deleteMatch = url.pathname.match(/^\/api\/accounts\/(\d+)$/);
    if (deleteMatch && req.method === 'DELETE') {
        const id = Number(deleteMatch[1]);
        const accounts = loadAccounts();
        if (!Number.isInteger(id) || id < 0 || id >= accounts.length) {
            sendJson(res, 404, { error: 'ACCOUNT_NOT_FOUND' });
            return;
        }
        accounts.splice(id, 1);
        saveAccounts(accounts);
        sendJson(res, 200, { ok: true, accounts: accounts.map(sanitizeAccount) });
        return;
    }
    if (url.pathname === '/api/config' && req.method === 'POST') {
        const body = (await readBody(req));
        const config = loadConfig();
        const next = safeConfigPatch(config, body);
        saveConfig(next);
        sendJson(res, 200, { ok: true, config: publicConfig(next) });
        return;
    }
    if (url.pathname === '/api/wecom' && req.method === 'POST') {
        const body = (await readBody(req));
        const config = loadConfig();
        const wecom = wecomFromPayload(body, config.webhook.wecom);
        const missing = validateWeComForSave(wecom);
        if (missing.length > 0) {
            sendJson(res, 400, {
                error: 'WECOM_REQUIRED_FIELDS_MISSING',
                message: `企业微信配置缺少或无效：${missing.join('、')}`
            });
            return;
        }
        const next = {
            ...config,
            webhook: {
                ...config.webhook,
                wecom
            }
        };
        saveConfig(next);
        sendJson(res, 200, { ok: true, wecom: publicWeComConfig(next) });
        return;
    }
    if (url.pathname === '/api/wecom/test' && req.method === 'POST') {
        const config = loadConfig();
        const wecom = config.webhook.wecom;
        if (!wecom) {
            sendJson(res, 400, { error: 'WECOM_NOT_CONFIGURED', message: '企业微信推送未配置' });
            return;
        }
        try {
            await (0, WeCom_1.testWeCom)(wecom);
            sendJson(res, 200, { ok: true, message: '测试推送已发送' });
        }
        catch (error) {
            sendJson(res, 400, {
                error: 'WECOM_TEST_FAILED',
                message: error instanceof Error ? error.message : String(error)
            });
        }
        return;
    }
    if (url.pathname === '/api/wecom/diagnose' && req.method === 'POST') {
        const config = loadConfig();
        const wecom = config.webhook.wecom;
        if (!wecom) {
            sendJson(res, 400, { error: 'WECOM_NOT_CONFIGURED', message: '企业微信推送未配置' });
            return;
        }
        try {
            const result = await (0, WeCom_1.diagnoseWeCom)(wecom);
            sendJson(res, 200, { ok: result.ok, message: result.message });
        }
        catch (error) {
            sendJson(res, 400, {
                error: 'WECOM_DIAGNOSE_FAILED',
                message: error instanceof Error ? error.message : String(error)
            });
        }
        return;
    }
    if (url.pathname === '/api/wecom/clear' && req.method === 'POST') {
        const config = loadConfig();
        const next = {
            ...config,
            webhook: {
                ...config.webhook,
                wecom: {
                    enabled: false,
                    corpId: '',
                    agentId: '',
                    corpSecret: '',
                    toUser: '',
                    proxyMode: 'direct',
                    proxyBaseUrl: ''
                }
            }
        };
        saveConfig(next);
        sendJson(res, 200, { ok: true, wecom: publicWeComConfig(next) });
        return;
    }
    notFound(res);
}
function readLastRunSummary() {
    if (runState.recentLog?.length) {
        return runState.recentLog.slice(-80).reverse().join('\n');
    }
    const lines = readRecentLogLines('manual', 80).map(line => line.safe);
    if (lines.length > 0)
        return lines.join('\n');
    const runtimeLines = readRecentLogLines('runtime', 80).map(line => line.safe);
    if (runtimeLines.length > 0)
        return runtimeLines.join('\n');
    return '暂无完成记录';
}
function logFileForSource(source) {
    return source === 'runtime' ? runtimeLogFile : manualRunLogFile;
}
function logFilesForSource(source) {
    if (source === 'runtime')
        return [runtimeLogFile];
    const todayFile = datedManualRunLogFile();
    return fs_1.default.existsSync(todayFile) ? [todayFile] : [manualRunLogFile];
}
function detectLogLevel(line) {
    if (/\[(ERROR|ERR)\]|\bERROR\b|错误|失败/i.test(line))
        return 'error';
    if (/\[WARN\]|\bWARN(?:ING)?\b|警告/i.test(line))
        return 'warn';
    if (/\[DEBUG\]|\bDEBUG\b/i.test(line))
        return 'debug';
    return 'info';
}
function normalizeLogSource(value) {
    return value === 'runtime' ? 'runtime' : 'manual';
}
function normalizeLogLevel(value) {
    return LOG_LEVELS.has(value) ? value : 'all';
}
function normalizeTail(value) {
    const n = Number(value ?? MAX_RUN_LOG_LINES);
    if (!Number.isFinite(n))
        return MAX_RUN_LOG_LINES;
    return Math.max(50, Math.min(MAX_RUN_LOG_LINES, Math.floor(n)));
}
function readRecentLogLines(source = 'manual', tail = MAX_RUN_LOG_LINES) {
    const lines = normalizeRawLogLines(logFilesForSource(source).flatMap(file => readTextFileTail(file)
        .split(/\r?\n/)
        .map((line, index) => rawLogLineFromText(line, index))
        .filter((line) => Boolean(line))), tail);
    if (lines.length > 0)
        return lines;
    if (source === 'manual') {
        return fallbackLogLines(tail);
    }
    return [];
}
function fallbackLogLines(tail = MAX_RUN_LOG_LINES) {
    const logDir = path_1.default.resolve(process.cwd(), 'logs');
    if (!fs_1.default.existsSync(logDir))
        return [];
    const files = fs_1.default
        .readdirSync(logDir)
        .filter(file => file.endsWith('.log'))
        .map(file => {
        const filePath = path_1.default.join(logDir, file);
        const stat = fs_1.default.statSync(filePath);
        return { filePath, mtimeMs: stat.mtimeMs, size: stat.size, isFile: stat.isFile() };
    })
        .filter(file => file.isFile && file.size > 0)
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, 5);
    const merged = [];
    for (const file of files) {
        const start = Math.max(0, file.size - MAX_RUN_LOG_BYTES);
        const fd = fs_1.default.openSync(file.filePath, 'r');
        const buffer = Buffer.alloc(file.size - start);
        fs_1.default.readSync(fd, buffer, 0, buffer.length, start);
        fs_1.default.closeSync(fd);
        const content = buffer.toString('utf8');
        merged.push(...content
            .split(/\r?\n/)
            .map((line, index) => rawLogLineFromText(line, index))
            .filter((line) => Boolean(line)));
    }
    return normalizeRawLogLines(merged, tail);
}
function rawLogLineFromText(line, seq = 0) {
    const raw = (0, logSanitizer_1.stripAnsi)(line);
    const safe = redactLogLine(raw);
    if (safe.trim().length === 0)
        return null;
    return { raw, safe, time: timestampFromStampedLine(safe), seq };
}
function normalizeRawLogLines(lines, tail) {
    const seen = new Set();
    return [...lines]
        .filter(line => {
        const key = line.safe;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    })
        .sort((a, b) => (b.time ?? 0) - (a.time ?? 0) || (b.seq ?? 0) - (a.seq ?? 0))
        .slice(0, tail);
}
function timestampFromStampedLine(line) {
    const match = line.match(/^\[(\d{4})-(\d{1,2})-(\d{1,2}),\s*(\d{1,2}):(\d{2}):(\d{2})\]/);
    if (!match)
        return 0;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}
function queryLogs(url) {
    const source = normalizeLogSource(url.searchParams.get('source'));
    const level = normalizeLogLevel(url.searchParams.get('level'));
    const query = (url.searchParams.get('query') ?? '').trim().toLowerCase();
    const tail = normalizeTail(url.searchParams.get('tail'));
    const lines = readRecentLogLines(source, tail)
        .map(line => ({ text: line.safe, level: detectLogLevel(line.safe) }))
        .filter(line => level === 'all' || line.level === level)
        .filter(line => !query || line.text.toLowerCase().includes(query));
    return { source, level, query, tail, lines };
}
function defaultTaskItems() {
    return [
        { key: 'desktop', label: 'PC搜索', completed: 0, total: 0, gained: 0, status: '等待运行' },
        { key: 'mobile', label: '移动搜索', completed: 0, total: 0, gained: 0, status: '等待运行' },
        { key: 'daily', label: '每日活动', completed: 0, total: 0, gained: 0, status: '等待运行' }
    ];
}
function emailKey(email) {
    return email.trim().toLowerCase();
}
function findProgressByLine(line, byEmail) {
    const lowerLine = line.toLowerCase();
    for (const [needle, progress] of byEmail) {
        if (needle && lowerLine.includes(needle)) {
            return progress;
        }
    }
    return null;
}
function progressItem(progress, key) {
    return progress.items.find(item => item.key === key) ?? progress.items[0];
}
function parseTaskProgress(accounts, lines = readRecentLogLines()) {
    const storedProgress = readStoredTaskProgress(accounts);
    const hasStoredProgress = storedProgress.some(group => group.currentStage !== 'idle' ||
        group.currentTask !== '等待运行' ||
        group.currentMessage !== '等待运行' ||
        group.details.length > 0 ||
        group.items.some(item => item.total > 0 || item.completed > 0 || item.gained > 0 || item.status !== '等待运行'));
    if (hasStoredProgress) {
        return storedProgress;
    }
    const chronological = [...lines].reverse();
    const byEmail = new Map();
    const values = [];
    const maskedCounts = accounts.reduce((counts, account) => {
        const key = emailKey(maskEmail(account.email));
        if (key)
            counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts;
    }, new Map());
    accounts.forEach((account, index) => {
        const label = maskEmail(account.email);
        const maskedKey = emailKey(label);
        const progress = {
            key: (0, TaskProgressStore_1.accountProgressHash)(account.email),
            accountLabel: `账号 ${index + 1} · ${label || '未填写邮箱'}`,
            initialPoints: 0,
            currentPoints: 0,
            finalPoints: 0,
            currentTask: '等待运行',
            currentStage: 'idle',
            currentMessage: '等待运行',
            items: defaultTaskItems(),
            details: []
        };
        byEmail.set(emailKey(account.email), progress);
        if (maskedKey && maskedCounts.get(maskedKey) === 1) {
            byEmail.set(maskedKey, progress);
        }
        values.push(progress);
    });
    let currentProgress = null;
    for (const line of chronological) {
        const explicitProgress = findProgressByLine(line.raw, byEmail);
        if (explicitProgress) {
            currentProgress = explicitProgress;
        }
        const progress = explicitProgress ?? currentProgress;
        if (!progress)
            continue;
        const rawLine = line.raw;
        const mobile = progressItem(progress, 'mobile');
        const desktop = progressItem(progress, 'desktop');
        const daily = progressItem(progress, 'daily');
        const missing = rawLine.match(/移动端缺失=(\d+).*桌面端缺失=(\d+)/);
        if (missing) {
            mobile.total = Number(missing[1] ?? 0);
            desktop.total = Number(missing[2] ?? 0);
            mobile.status = mobile.total > 0 ? '进行中' : '已完成';
            desktop.status = desktop.total > 0 ? '进行中' : '已完成';
        }
        const mobileDone = rawLine.match(/(?:移动端(?:完成|=.*?)|SEARCH-MOBILE-SEARCH.*搜索完成).*获得=(\d+)(?:\/(\d+))?/);
        if (mobileDone) {
            const gained = Number(mobileDone[1] ?? 0);
            const total = Number(mobileDone[2] ?? 0);
            if (total > 0)
                mobile.total = Math.max(mobile.total, total);
            mobile.gained = Math.max(mobile.gained, gained);
            mobile.completed = mobile.total > 0 ? Math.min(mobile.total, gained) : gained;
            mobile.status = '已完成';
        }
        const desktopDone = rawLine.match(/(?:桌面端(?:完成|=.*?)|SEARCH-DESKTOP-(?:PARALLEL|SEQUENTIAL).*搜索完成).*获得=(\d+)(?:\/(\d+))?/);
        if (desktopDone) {
            const gained = Number(desktopDone[1] ?? 0);
            const total = Number(desktopDone[2] ?? 0);
            if (total > 0)
                desktop.total = Math.max(desktop.total, total);
            desktop.gained = Math.max(desktop.gained, gained);
            desktop.completed = desktop.total > 0 ? Math.min(desktop.total, gained) : gained;
            desktop.status = '已完成';
        }
        const flow = rawLine.match(/已收集:\s*\+(\d+)\s*\|\s*移动端:\s*\+(\d+)\s*\|\s*桌面端:\s*\+(\d+)/);
        if (flow) {
            const mobileGained = Number(flow[2] ?? 0);
            const desktopGained = Number(flow[3] ?? 0);
            mobile.gained = Math.max(mobile.gained, mobileGained);
            desktop.gained = Math.max(desktop.gained, desktopGained);
            mobile.completed = mobile.total > 0 ? Math.min(mobile.total, mobileGained) : mobileGained;
            desktop.completed = desktop.total > 0 ? Math.min(desktop.total, desktopGained) : desktopGained;
            mobile.status = '已完成';
            desktop.status = '已完成';
        }
        const accountEnd = rawLine.match(/ACCOUNT-END.*总计:\s*\+(\d+)/);
        if (accountEnd) {
            daily.gained = Number(accountEnd[1] ?? 0);
            daily.completed = daily.gained;
            daily.total = Math.max(daily.total, daily.gained);
            daily.status = '已完成';
        }
    }
    return values;
}
function readStoredTaskProgress(accounts) {
    const stored = (0, TaskProgressStore_1.readTaskProgressFile)();
    return accounts.map((account, index) => {
        const label = maskEmail(account.email);
        const saved = stored.accounts.find(item => item.accountHash === (0, TaskProgressStore_1.accountProgressHash)(account.email));
        const items = defaultTaskItems();
        if (saved) {
            for (const item of items) {
                const storedItem = saved[item.key];
                if (!storedItem)
                    continue;
                item.completed = Number(storedItem.completed ?? 0);
                item.total = Number(storedItem.total ?? 0);
                item.gained = Number(storedItem.gained ?? 0);
                item.status = storedItem.status ?? item.status;
            }
        }
        return {
            key: (0, TaskProgressStore_1.accountProgressHash)(account.email),
            accountLabel: `账号 ${index + 1} · ${label || '未填写邮箱'}`,
            initialPoints: saved?.initialPoints ?? 0,
            currentPoints: saved?.currentPoints ?? saved?.finalPoints ?? 0,
            finalPoints: saved?.finalPoints ?? saved?.currentPoints ?? 0,
            currentTask: saved?.currentTask ?? '等待运行',
            currentStage: saved?.currentStage ?? 'idle',
            currentMessage: saved?.currentMessage ?? saved?.currentTask ?? '等待运行',
            items,
            details: Array.isArray(saved?.details)
                ? saved.details
                    .map(item => ({
                    key: item.key,
                    label: item.label,
                    completed: Number(item.completed ?? 0),
                    total: Number(item.total ?? 0),
                    gained: Number(item.gained ?? 0),
                    status: item.status ?? '等待运行',
                    message: item.message ?? '',
                    group: item.group,
                    updatedAt: item.updatedAt
                }))
                    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
                : []
        };
    });
}
function buildTaskEvents(groups, limit = 12) {
    const events = [];
    for (const group of groups) {
        const account = group.accountLabel;
        const updatedAt = latestGroupUpdate(group);
        if (isMeaningfulTaskMessage(group.currentTask, group.currentMessage)) {
            events.push({
                id: `${group.key}:current:${updatedAt}`,
                account,
                stage: group.currentStage || 'running',
                task: group.currentTask || '等待运行',
                status: stageLabel(group.currentStage),
                progress: currentTaskProgress(group),
                gained: groupRunGained(group),
                message: group.currentMessage || group.currentTask || '',
                updatedAt
            });
        }
        for (const detail of group.details) {
            if (!isMeaningfulTaskMessage(detail.label, detail.message || detail.status))
                continue;
            events.push({
                id: `${group.key}:detail:${detail.key}:${detail.updatedAt ?? ''}`,
                account,
                stage: String(detail.group || ''),
                task: detail.label,
                status: detail.status || '-',
                progress: taskProgressText(detail),
                gained: Number(detail.gained || 0),
                message: detail.message || detail.status || '',
                updatedAt: detail.updatedAt || updatedAt
            });
        }
        for (const item of group.items) {
            if (!item.total && !item.completed && !item.gained && item.status === '等待运行')
                continue;
            events.push({
                id: `${group.key}:item:${item.key}:${item.updatedAt ?? updatedAt}`,
                account,
                stage: item.key,
                task: item.label,
                status: item.status || '-',
                progress: taskProgressText(item),
                gained: Number(item.gained || 0),
                message: item.message || item.status || '',
                updatedAt: item.updatedAt || updatedAt
            });
        }
    }
    const seen = new Set();
    return events
        .filter(event => event.task && !/^搜索任务[:：]?\s*PC搜索$/.test(`${event.task}：${event.message}`))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .filter(event => {
        const key = [event.account, event.task, event.status, event.progress, event.gained, event.message].join('|');
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    })
        .slice(0, limit);
}
function latestGroupUpdate(group) {
    const timestamps = [group.items, group.details]
        .flat()
        .map(item => item.updatedAt || '')
        .concat('')
        .sort();
    return timestamps[timestamps.length - 1] || '';
}
function isMeaningfulTaskMessage(task, message) {
    const value = `${task} ${message}`.trim();
    if (!value || /等待运行/.test(value))
        return false;
    if (/^搜索任务\s+PC搜索$/.test(value))
        return false;
    if (/^搜索任务[:：]?\s*PC搜索$/.test(value))
        return false;
    return true;
}
function currentTaskProgress(group) {
    const task = group.currentTask || '';
    const item = task.includes('移动')
        ? progressItem(group, 'mobile')
        : task.includes('PC') || task.includes('搜索')
            ? progressItem(group, 'desktop')
            : progressItem(group, 'daily');
    return taskProgressText(item);
}
function taskProgressText(item) {
    const completed = Number(item.completed || 0);
    const total = Number(item.total || 0);
    if (total > 0)
        return `${completed}/${total}`;
    if (completed > 0)
        return String(completed);
    return '-';
}
function groupRunGained(group) {
    return group.items.reduce((sum, item) => sum + Number(item.gained || 0), 0);
}
function stageLabel(stage) {
    switch (stage) {
        case 'login':
            return '登录中';
        case 'dashboard':
            return '读取仪表盘';
        case 'activity':
            return '执行活动';
        case 'search':
            return '搜索中';
        case 'complete':
            return '已完成';
        case 'error':
            return '失败';
        default:
            return stage || '进行中';
    }
}
function loginHtml(setupRequired) {
    const title = setupRequired ? '首次启动设置' : '管理员登录';
    const action = setupRequired ? '/api/setup' : '/api/login';
    const button = setupRequired ? '创建管理员账号' : '登录';
    const hint = setupRequired ? '创建本地管理员账号，用于保护管理入口。' : '使用本地管理员账号进入管理入口。';
    const confirmField = setupRequired
        ? '<label class="auth-field"><span>确认密码</span><input name="passwordConfirm" type="password" autocomplete="new-password" placeholder="再次输入管理员密码" required minlength="8"></label>'
        : '';
    const note = setupRequired
        ? '账号哈希仅保存在本机运行目录，不会展示真实凭证。'
        : '未登录时仅显示此页面，不加载任何管理内容。';
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - Microsoft Rewards Script</title>
<style>${baseCss()}</style>
</head>
<body class="login-body">
<main class="login-shell ${setupRequired ? 'setup-shell' : 'signin-shell'}">
  <div class="auth-shape auth-shape-a"></div>
  <div class="auth-shape auth-shape-b"></div>
  <section class="login-panel">
    <div class="brand-lock">
      <div class="brand-mark">MR</div>
      <div>
        <strong>Microsoft Rewards Script</strong>
        <span>Local Web Admin</span>
      </div>
    </div>
    <h1>${title}</h1>
    <p class="auth-hint">${hint}</p>
    <form id="loginForm" class="login-form">
      <label class="auth-field"><span>${setupRequired ? '本地管理员账号' : '用户名'}</span><input name="username" autocomplete="username" placeholder="admin" required minlength="3"></label>
      <label class="auth-field"><span>${setupRequired ? '管理员密码' : '密码'}</span><input name="password" type="password" autocomplete="${setupRequired ? 'new-password' : 'current-password'}" placeholder="${setupRequired ? '至少 8 位' : '********'}" required minlength="8"></label>
      ${confirmField}
      <button class="primary-btn wide-btn" type="submit"><span>${button}</span></button>
      <p id="message" class="form-message" aria-live="polite"></p>
    </form>
    <div class="security-note">${note}</div>
  </section>
</main>
<script>
const form = document.querySelector('#loginForm');
const message = document.querySelector('#message');
form.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = '处理中...';
  const data = Object.fromEntries(new FormData(form).entries());
  const res = await fetch('${action}', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  if (res.ok) {
    location.href = '/';
    return;
  }
  const body = await res.json().catch(() => ({}));
  message.textContent = body.message || '登录失败，请检查账号或密码';
});
</script>
</body>
</html>`;
}
function appHtml() {
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Microsoft Rewards Script 管理后台</title>
<style>${baseCss()}</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="logo-row">
      <div class="brand-mark">MR</div>
      <div><strong>Microsoft Rewards Script</strong><span>Local Web Admin</span></div>
    </div>
    <nav>
      <button class="nav-item active" data-view="dashboard"><span class="nav-icon">⌂</span>仪表盘</button>
      <button class="nav-item" data-view="accounts"><span class="nav-icon">◎</span>账号设置</button>
      <button class="nav-item" data-view="tasks"><span class="nav-icon">☷</span>任务配置</button>
      <button class="nav-item" data-view="pointsCalendar"><span class="nav-icon">▦</span>积分日历</button>
      <button class="nav-item" data-view="logs"><span class="nav-icon">≡</span>运行日志</button>
      <button class="nav-item" data-view="wecom"><span class="nav-icon">✉</span>企业微信推送</button>
      <button class="nav-item" data-view="system"><span class="nav-icon">⚙</span>系统设置</button>
    </nav>
    <section class="sidebar-note">
      <strong>本地管理已启用</strong>
      <p>凭证与会话仅存放在本机运行目录。</p>
    </section>
  </aside>
  <main class="main">
    <header class="topbar">
      <div><h1 id="pageTitle">仪表盘</h1><p id="pageSubtitle">查看运行概况，维护账号、任务与系统参数。</p></div>
      <div class="top-actions">
        <div class="theme-toggle-wrap" id="themeToggleWrap">
          <button class="theme-btn active" data-theme-val="auto" onclick="setTheme('auto')" title="跟随系统">💻</button>
          <button class="theme-btn" data-theme-val="dark" onclick="setTheme('dark')" title="深色模式">🌙</button>
          <button class="theme-btn" data-theme-val="light" onclick="setTheme('light')" title="浅色模式">☀️</button>
        </div>
        <span id="userBadge" class="user-badge">admin</span>
        <span class="env-pill">Local</span>
        <button id="logoutBtn" class="icon-btn" title="退出登录">↗</button>
      </div>
    </header>
    <section id="dashboard" class="view active"></section>
    <section id="accounts" class="view"></section>
    <section id="tasks" class="view"></section>
    <section id="pointsCalendar" class="view"></section>
    <section id="logs" class="view"></section>
    <section id="wecom" class="view"></section>
    <section id="system" class="view"></section>
  </main>
</div>
<div id="modal" class="modal hidden"></div>
<script>${clientJs()}</script>
</body>
</html>`;
}
function baseCss() {
    return `
:root, [data-theme="dark"] {
  --bg-base: #090d16;
  --bg-gradient: radial-gradient(circle at top right, #1e1b4b 0%, #0f172a 45%, #090d16 100%);
  --bg: #090d16;
  --bg-strong: #0f172a;
  --surface: rgba(22, 30, 49, 0.78);
  --surface-soft: rgba(30, 41, 59, 0.65);
  --surface-card: rgba(30, 41, 59, 0.75);
  --surface-hover: rgba(30, 41, 59, 0.95);
  --line: rgba(255, 255, 255, 0.1);
  --line-light: rgba(255, 255, 255, 0.18);
  --primary: #0078D4;
  --primary-hover: #0284C7;
  --accent: #38BDF8;
  --teal: #0EA5E9;
  --teal-dark: #38BDF8;
  --teal-soft: rgba(14, 165, 233, 0.16);
  --success: #10B981;
  --warning: #F59E0B;
  --amber: #F59E0B;
  --danger: #EF4444;
  --blue: #3B82F6;
  --text: #F8FAFC;
  --sub: #94A3B8;
  --muted: #64748B;
  --card-inner: rgba(255, 255, 255, 0.04);
  --shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
  --shadow-card: 0 8px 24px rgba(0, 0, 0, 0.3);
  --terminal-bg: rgba(5, 8, 15, 0.95);
  --modal-bg: #131c2e;
}
[data-theme="light"] {
  --bg-base: #F8FAFC;
  --bg-gradient: radial-gradient(circle at top right, #E0E7FF 0%, #F1F5F9 50%, #E2E8F0 100%);
  --bg: #F8FAFC;
  --bg-strong: #E2E8F0;
  --surface: rgba(255, 255, 255, 0.92);
  --surface-soft: rgba(241, 245, 249, 0.88);
  --surface-card: rgba(255, 255, 255, 0.9);
  --surface-hover: rgba(255, 255, 255, 0.98);
  --line: rgba(0, 0, 0, 0.08);
  --line-light: rgba(0, 0, 0, 0.15);
  --primary: #0078D4;
  --primary-hover: #0284C7;
  --accent: #0284C7;
  --teal: #0284C7;
  --teal-dark: #0369A1;
  --teal-soft: rgba(2, 132, 199, 0.12);
  --success: #059669;
  --warning: #D97706;
  --amber: #D97706;
  --danger: #DC2626;
  --blue: #2563EB;
  --text: #0F172A;
  --sub: #475569;
  --muted: #64748B;
  --card-inner: rgba(241, 245, 249, 0.85);
  --shadow: 0 16px 36px rgba(0, 0, 0, 0.08);
  --shadow-card: 0 8px 24px rgba(0, 0, 0, 0.06);
  --terminal-bg: #0F172A;
  --modal-bg: #FFFFFF;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--text);
  background: var(--bg-gradient);
  background-color: var(--bg-base);
  min-height: 100vh;
  transition: background 0.3s ease, color 0.3s ease;
}
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .65; }

/* Login Shell */
.login-body { min-height: 100vh; overflow: hidden; background: var(--bg-gradient); }
.login-shell { min-height: 100vh; position: relative; display: grid; place-items: center; padding: 28px; }
.login-panel {
  position: relative;
  width: min(540px, calc(100vw - 36px));
  background: var(--surface-card);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 44px 48px;
  box-shadow: var(--shadow);
}
.brand-lock { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
.brand-lock strong { font-size: 16px; font-weight: 800; }
.brand-lock span { display: block; margin-top: 4px; color: var(--muted); font: 12px/1.2 monospace; }
.brand-mark {
  width: 46px; height: 46px; border-radius: 14px;
  background: linear-gradient(135deg, #0284C7, #0369A1);
  display: grid; place-items: center; color: #fff;
  font: 800 16px/1 monospace;
  box-shadow: 0 4px 16px rgba(2, 132, 199, 0.45);
}
.login-panel h1 { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
.auth-hint { margin: 10px 0 28px; color: var(--sub); font-size: 14px; line-height: 1.5; }
.login-form { display: grid; gap: 18px; }
.auth-field { display: grid; gap: 8px; font-size: 13px; font-weight: 700; color: var(--sub); }
.auth-field input {
  height: 48px; width: 100%; border: 1px solid var(--line); border-radius: 12px;
  background: var(--card-inner); padding: 0 16px; color: var(--text); outline: none;
  transition: all 0.2s ease;
}
.auth-field input:focus, .field input:focus, .field select:focus, .field textarea:focus {
  border-color: var(--accent); box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
}
.primary-btn {
  height: 44px; border: 0; border-radius: 12px;
  background: linear-gradient(135deg, #0078D4, #0284C7);
  color: #fff; font-weight: 800; padding: 0 20px;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  box-shadow: 0 4px 14px rgba(0, 120, 212, 0.35);
  transition: all 0.2s ease;
}
.primary-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0, 120, 212, 0.45); }
.wide-btn { height: 48px; width: 100%; margin-top: 4px; }
.form-message { min-height: 18px; margin: 0; color: var(--danger); font-size: 13px; }
.security-note {
  margin-top: 18px; padding: 12px 16px; border-radius: 12px;
  background: var(--card-inner); border: 1px solid var(--line);
  color: var(--sub); font-size: 13px; line-height: 1.45;
}

/* App Main Layout */
.app {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  min-height: 100vh;
}
.sidebar {
  background: var(--surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid var(--line);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.logo-row { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 0 6px 8px; }
.logo-row strong { font-size: 15px; font-weight: 800; }
.logo-row span { font-size: 12px; color: var(--muted); display: block; margin-top: 2px; }
.sidebar nav { display: grid; gap: 8px; }
.nav-item {
  height: 44px; border: 0; border-radius: 12px; background: transparent;
  display: flex; align-items: center; gap: 12px; padding: 0 14px;
  color: var(--sub); font-size: 14px; font-weight: 700; text-align: left;
  transition: all 0.2s ease;
}
.nav-item:hover { background: var(--card-inner); color: var(--text); }
.nav-item.active {
  background: var(--teal-soft); color: var(--teal-dark);
  font-weight: 800; border: 1px solid rgba(56, 189, 248, 0.3);
}
.nav-icon { width: 18px; height: 18px; display: grid; place-items: center; }
.sidebar-note {
  margin-top: auto; border: 1px solid var(--line); background: var(--card-inner);
  border-radius: 14px; padding: 16px;
}
.sidebar-note strong { font-size: 13px; color: var(--text); }
.sidebar-note p { margin: 6px 0 0; color: var(--sub); font-size: 12px; line-height: 1.45; }

/* Main Area & Topbar */
.main { min-width: 0; display: flex; flex-direction: column; }
.topbar {
  padding: 28px 36px 18px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.topbar h1 { font-size: 26px; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.3px; }
.topbar p { margin: 0; color: var(--sub); font-size: 14px; }
.top-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

/* Theme Toggle Capsule */
.theme-toggle-wrap {
  display: flex; align-items: center; gap: 2px;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 999px; padding: 3px;
}
.theme-btn {
  border: 0; background: transparent; color: var(--sub);
  width: 32px; height: 32px; border-radius: 999px;
  display: grid; place-items: center; font-size: 15px;
  transition: all 0.2s ease;
}
.theme-btn.active { background: var(--teal-soft); color: var(--teal-dark); font-weight: 800; }
.theme-btn:hover:not(.active) { color: var(--text); }

.user-badge, .env-pill {
  height: 36px; display: inline-flex; align-items: center;
  border-radius: 10px; border: 1px solid var(--line);
  background: var(--surface); padding: 0 12px;
  color: var(--text); font-size: 13px; font-weight: 800;
}
.icon-btn, .ghost-btn, .small-btn, .danger-btn {
  height: 38px; border: 1px solid var(--line); border-radius: 10px;
  background: var(--surface); color: var(--text); padding: 0 14px;
  display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700;
  transition: all 0.2s ease;
}
.icon-btn { width: 38px; padding: 0; justify-content: center; }
.ghost-btn:hover, .icon-btn:hover { background: var(--surface-hover); border-color: var(--line-light); }
.danger-btn { color: var(--danger); border-color: rgba(239, 68, 68, 0.3); }

/* Views & Cards */
.view { display: none; }
.view.active { display: block; }
.content-grid { padding: 0 36px 40px; display: grid; gap: 24px; }

/* Hero Metrics 5-Card Grid */
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}
.card, .section {
  background: var(--surface-card);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow-card);
}
.metric {
  background: var(--surface-card);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 20px 22px;
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 16px;
  align-items: center;
  box-shadow: var(--shadow-card);
  transition: transform 0.2s ease, border-color 0.2s ease;
}
.metric:hover { transform: translateY(-2px); border-color: var(--line-light); }
.metric-icon {
  width: 46px; height: 46px; border-radius: 14px;
  background: var(--teal-soft); display: grid; place-items: center;
  color: var(--teal-dark); font-size: 20px; font-weight: 900;
}
.metric small { display: block; color: var(--sub); font-size: 13px; font-weight: 600; }
.metric strong {
  display: block; margin: 4px 0 2px;
  font-size: 28px; font-weight: 800; letter-spacing: -0.5px;
  color: var(--text);
}
.metric .metric-hint { font-size: 12px; color: var(--muted); margin-top: 2px; }
.metric.hero-earned strong { color: #10B981; }
.metric.hero-accent strong { color: #38BDF8; }
.metric.hero-gold strong { color: #F59E0B; }

/* Layout Grids */
.split-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(360px, 1fr); gap: 24px; }
.bottom-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; }
.section { padding: 24px 28px; }
.section h2 { font-size: 18px; font-weight: 800; margin: 0; color: var(--text); }
.section-note { margin: 6px 0 18px; color: var(--sub); font-size: 13px; line-height: 1.45; }
.toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }

/* Tables */
.table-wrap { overflow: auto; border-radius: 12px; border: 1px solid var(--line); }
.table { width: 100%; border-collapse: collapse; min-width: 720px; }
.table th, .table td { border-bottom: 1px solid var(--line); padding: 14px 16px; text-align: left; font-size: 13px; }
.table th { background: var(--card-inner); color: var(--sub); font-weight: 800; font-size: 12px; }
.table tr:last-child td { border-bottom: 0; }
.table tr:hover td { background: var(--card-inner); }

/* Badges & Pills */
.pill, .status-pill {
  display: inline-flex; align-items: center; gap: 6px;
  border-radius: 999px; padding: 4px 12px;
  background: var(--teal-soft); color: var(--teal-dark);
  font-weight: 800; font-size: 12px;
}
.status-pill.state-unknown, .status-pill.state-pending, .status-pill.state-skipped, .status-pill.state-notrun {
  background: rgba(148, 163, 184, 0.15); color: var(--sub);
}
.status-pill.state-checking, .status-pill.state-running, .status-pill.state-interrupted, .status-pill.state-partial {
  background: rgba(56, 189, 248, 0.18); color: var(--accent);
}
.status-pill.state-valid, .status-pill.state-success, .status-pill.state-completed {
  background: rgba(16, 185, 129, 0.18); color: var(--success);
}
.status-pill.state-error, .status-pill.state-failed {
  background: rgba(239, 68, 68, 0.18); color: var(--danger);
}

/* Forms & Fields */
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.field { display: grid; gap: 8px; }
.field label { font-size: 12px; color: var(--sub); font-weight: 700; }
.field input, .field select, .field textarea {
  border: 1px solid var(--line); border-radius: 12px; padding: 0 14px;
  background: var(--card-inner); color: var(--text); outline: none;
  transition: all 0.2s ease;
}
.field input, .field select { height: 42px; }
.field textarea { min-height: 96px; padding: 12px; line-height: 1.45; resize: vertical; }
.field.full { grid-column: 1/-1; }
.switch-row { display: grid; gap: 12px; }
.toggle {
  min-height: 52px; display: flex; justify-content: space-between; align-items: center;
  gap: 14px; padding: 12px 18px; border: 1px solid var(--line); border-radius: 12px;
  background: var(--card-inner); font-weight: 700; font-size: 14px;
}
.toggle input { width: 44px; height: 24px; accent-color: var(--primary); }

/* Progress Items & Glow Bar */
.progress-list { display: grid; gap: 16px; }
.progress-account {
  border: 1px solid var(--line); border-radius: 14px;
  background: var(--card-inner); padding: 18px 20px;
}
.progress-heading {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 14px;
}
.progress-heading h3 { margin: 0; font-size: 16px; font-weight: 800; }
.progress-heading span { color: var(--accent); font-weight: 800; font-size: 14px; }
.progress-items { display: grid; gap: 12px; }
.progress-row {
  display: grid; grid-template-columns: 140px minmax(120px, 1fr) 90px 110px;
  gap: 16px; align-items: center; font-size: 13px;
}
.progress-row strong { font-size: 13px; color: var(--text); }
.progress-bar {
  height: 9px; border-radius: 999px; background: rgba(255, 255, 255, 0.08);
  overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.3);
}
.progress-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, #0284C7, #38BDF8);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
  transition: width 0.4s ease;
}
.progress-points { color: #10B981; font-weight: 800; text-align: right; }
.progress-status { color: var(--muted); font-size: 12px; display: block; margin-top: 4px; }

/* History Chart */
.history-chart-card { margin-top: 4px; }
.chart-controls { display: flex; align-items: center; gap: 8px; }
.chart-pill {
  padding: 4px 14px; border-radius: 999px; font-size: 12px; font-weight: 800;
  border: 1px solid var(--line); background: transparent; color: var(--sub);
  transition: all 0.2s ease;
}
.chart-pill.active { background: var(--teal-soft); color: var(--teal-dark); border-color: rgba(56, 189, 248, 0.3); }
.chart-container {
  min-height: 180px; padding: 24px 12px 8px; display: flex; align-items: flex-end;
  gap: 12px; overflow-x: auto;
}
.chart-bars-row { width: 100%; display: flex; align-items: flex-end; gap: 12px; min-height: 160px; }
.chart-col {
  flex: 1; min-width: 38px; display: flex; flex-direction: column;
  align-items: center; gap: 8px; cursor: pointer; transition: transform 0.2s ease;
}
.chart-col:hover { transform: translateY(-4px); }
.chart-val { font-size: 11px; font-weight: 800; color: #10B981; }
.chart-bar-track {
  width: 18px; height: 110px; border-radius: 6px;
  background: rgba(255, 255, 255, 0.06); display: flex; align-items: flex-end;
  overflow: hidden;
}
.chart-bar-fill {
  width: 100%; border-radius: 6px;
  background: linear-gradient(180deg, #38BDF8 0%, #0284C7 100%);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
  transition: height 0.5s ease;
}
.chart-date { font-size: 11px; color: var(--muted); white-space: nowrap; }

/* Log Box (Terminal Style) */
.log-box {
  background: var(--terminal-bg);
  border: 1px solid var(--line);
  border-radius: 14px;
  color: #E2E8F0;
  padding: 18px 20px;
  font-family: Consolas, Monaco, monospace;
  font-size: 13px;
  line-height: 1.65;
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.5);
  height: 340px;
  overflow-x: hidden;
  overflow-y: auto;
}
.log-box.large { height: 560px; }
.log-line.error { color: #F87171; }
.log-line.warn { color: #FBBF24; }
.log-line.debug { color: #94A3B8; }

/* Settings & Timeline */
.settings-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.setting-item {
  border: 1px solid var(--line); border-radius: 12px;
  background: var(--card-inner); padding: 14px 16px;
}
.setting-item span { display: block; color: var(--muted); font-size: 12px; font-weight: 700; }
.setting-item strong {
  display: block; margin-top: 6px; color: var(--accent);
  font: 800 13px/1.3 monospace; word-break: break-word;
}
.task-timeline { display: grid; gap: 10px; margin-top: 18px; max-height: 320px; overflow: auto; }
.task-event {
  display: grid; grid-template-columns: 120px minmax(140px, 1fr) 100px 80px minmax(180px, 2fr);
  gap: 12px; align-items: center; border: 1px solid var(--line);
  background: var(--card-inner); border-radius: 12px; padding: 12px 16px; font-size: 13px;
}

/* Modal */
.modal {
  position: fixed; inset: 0; background: rgba(5, 8, 15, 0.7);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  display: grid; place-items: center; padding: 24px; z-index: 50;
}
.modal.hidden { display: none; }
.modal-card {
  width: min(720px, 100%); max-height: calc(100vh - 48px); overflow: auto;
  background: var(--modal-bg); border: 1px solid var(--line);
  border-radius: 20px; padding: 32px 36px; box-shadow: var(--shadow);
}
.modal-card h2 { margin: 0 0 20px; font-size: 20px; font-weight: 800; }
.modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }

/* Empty state */
.empty-state {
  padding: 36px; text-align: center; color: var(--sub);
  background: var(--card-inner); border: 1px dashed var(--line);
  border-radius: 14px; font-size: 14px;
}

@media (max-width: 960px) {
  .app { grid-template-columns: 1fr; }
  .sidebar { position: static; padding: 16px; }
  .sidebar nav { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
  .topbar { padding: 20px; }
  .content-grid { padding: 0 20px 30px; }
  .split-grid, .bottom-grid { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
  .progress-row { grid-template-columns: 1fr; gap: 8px; }
}
`;
}
function clientJs() {
    return `
let state = null;
let pollTimer = null;
let logPollTimer = null;
let pointsCalendarData = null;
let currentView = 'dashboard';
let wecomDirty = false;
let wecomSaving = false;
const logFilters = {source:'manual', level:'all', tail:'1000', query:'', autoRefresh:false};
const pointsFilters = {account:'all', range:'month', start:'', end:''};
const views = ['dashboard','accounts','tasks','pointsCalendar','logs','wecom','system'];
const titles = {dashboard:'仪表盘',accounts:'账号设置',tasks:'任务配置',pointsCalendar:'积分日历',logs:'运行日志',wecom:'企业微信推送',system:'系统设置'};
const workerLabels = {
  doDailySet:'每日任务', doClaimBonusPoints:'领取奖励积分', doSpecialPromotions:'特殊活动',
  doMorePromotions:'更多推广', doPunchCards:'打卡活动', doAppPromotions:'App 活动',
  doDesktopSearch:'PC搜索', doMobileSearch:'移动搜索', doDailyCheckIn:'每日签到',
  doReadToEarn:'阅读赚取', doDesktopApp:'桌面应用专享'
};
function initTheme(){
  const saved = localStorage.getItem('mrs_theme') || 'dark';
  applyTheme(saved);
}
function applyTheme(theme){
  let active = theme;
  if (theme === 'auto') {
    active = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', active);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme-val') === theme);
  });
}
window.setTheme = function(theme){
  localStorage.setItem('mrs_theme', theme);
  applyTheme(theme);
};
initTheme();
const subtitles = {
  dashboard:'查看运行概况，维护账号、任务与系统参数。',
  accounts:'维护 Microsoft 账号，敏感字段保存后不在页面回显。',
  tasks:'调整任务开关、并发与延迟参数。',
  pointsCalendar:'按账号和时间范围查看每天积分变化、分类来源与每次执行记录。',
  logs:'查看脱敏后的运行日志，定位任务告警和失败原因。',
  wecom:'配置企业微信应用推送，账号完成后立即发送任务摘要。',
  system:'查看本地运行环境与基础设置。'
};
async function api(path, options = {}) {
  const res = await fetch(path, {headers:{'Content-Type':'application/json'}, ...options});
  if (res.status === 401) { location.reload(); throw new Error('UNAUTHENTICATED'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || '请求失败');
  return body;
}
function el(id){return document.getElementById(id)}
function esc(v){return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function loadState(){ state = await api('/api/state'); renderAll(); updateRunPolling(); }
function updateRunPolling(){
  if (state?.runState?.running && !pollTimer) {
    pollTimer = setInterval(() => loadState().catch(() => {}), 3000);
  }
  if (!state?.runState?.running && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
function switchView(view){
  currentView = view;
  views.forEach(v => el(v).classList.toggle('active', v === view));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  el('pageTitle').textContent = titles[view];
  el('pageSubtitle').textContent = subtitles[view];
  if (view === 'logs') loadLogs().catch(err => showLogMessage(err.message));
  if (view === 'pointsCalendar') {
    if (pointsCalendarData) renderPointsCalendar();
    else loadPointsCalendar().catch(err => renderPointsCalendarError(err.message));
  }
  updateLogPolling(view);
}
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
el('logoutBtn').addEventListener('click', async () => { await api('/api/logout', {method:'POST', body:'{}'}); location.reload(); });
function renderAll(){
  el('userBadge').textContent = state.user.username;
  renderDashboard(); renderAccounts(); renderTasks();
  if (currentView !== 'pointsCalendar') renderPointsCalendar();
  if (currentView !== 'logs') renderLogs();
  if (!(currentView === 'wecom' && wecomDirty && !wecomSaving)) renderWeCom();
  renderSystem();
}
function metric(name,value,sub,icon,extraClass=''){return '<article class="card metric '+extraClass+'"><div class="metric-icon">'+icon+'</div><div><small>'+name+'</small><strong>'+value+'</strong><small class="metric-hint">'+sub+'</small></div></article>'}
function safeStateClass(value){return String(value || 'unknown').toLowerCase().replace(/[^a-z-]/g, '') || 'unknown'}
function accountStatusCell(a){
  const s = a.status || {};
  const message = s.lastMessage || '尚未检测';
  return '<div class="account-status"><span class="status-pill state-'+safeStateClass(s.state)+'">'+esc(s.label || '未检测')+'</span><small title="'+esc(message)+'">'+esc(message)+'</small></div>';
}
function checkpointCell(a){
  const c = a.checkpoint || {};
  const message = c.lastMessage || '今天尚未运行';
  return '<div class="account-status"><span class="status-pill state-'+safeStateClass(c.state)+'">'+esc(c.label || '无记录')+'</span><small title="'+esc(message)+'">'+esc(message)+'</small></div>';
}
function accountActions(){
  return '<div class="top-actions"><button class="ghost-btn" onclick="checkAccountStatus()" '+(state.runState.running?'disabled':'')+'>检测账号状态</button><button class="primary-btn" onclick="openAccount()">新增账号</button></div>';
}
function accountTable(limit){
  const accounts = limit ? state.accounts.slice(0, limit) : state.accounts;
  const rows = accounts.map(a => '<tr><td>'+esc(a.maskedEmail)+'</td><td>'+accountStatusCell(a)+'</td><td>'+checkpointCell(a)+'</td><td>'+esc(a.geoLocale)+'</td><td>'+esc(a.langCode)+'</td><td>'+(a.proxyEnabled?'<span class="pill">代理</span>':'-')+'</td><td>'+(a.hasTotpSecret?'已配置':'-')+'</td><td><button class="small-btn" onclick="openAccount('+a.id+')">编辑</button> <button class="danger-btn" onclick="deleteAccount('+a.id+')">删除</button></td></tr>').join('');
  return '<div class="table-wrap"><table class="table"><thead><tr><th>邮箱</th><th>账号状态</th><th>续跑状态</th><th>地区</th><th>语言</th><th>代理</th><th>TOTP</th><th>操作</th></tr></thead><tbody>'+(rows || '<tr><td colspan="8">暂无账号，请新增。</td></tr>')+'</tbody></table></div>';
}
function taskToggles(limit){
  return Object.entries(state.config.workers).slice(0, limit).map(([key,val]) => '<label class="toggle"><span>'+workerLabels[key]+'</span><input type="checkbox" name="'+key+'" '+(val?'checked':'')+'></label>').join('');
}
function settingsItems(){
  const c = state.config;
  return '<div class="settings-list">'
    + setting('Headless', String(c.headless))
    + setting('Workers', state.stats.workersEnabled + ' enabled')
    + setting('Cron', state.schedule.schedule)
    + setting('Debug Logs', String(c.debugLogs))
    + '</div>';
}
function setting(name,value){return '<div class="setting-item"><span>'+esc(name)+'</span><strong>'+esc(value)+'</strong></div>'}
function fmtDuration(seconds){
  const n = Number(seconds || 0);
  if (!n) return '-';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return (h ? h + '小时' : '') + (m ? m + '分' : '') + s + '秒';
}
function sourceLabel(source){
  return source === 'cron' ? '定时任务' : source === 'web' ? 'Web手动' : source === 'startup' ? '启动任务' : '未知来源';
}
function accountModeLabel(mode){
  return mode === 'failed' ? '只重跑失败账号' : mode === 'all' ? '强制全量重跑' : mode === 'account' ? '重跑指定账号' : '继续未完成账号';
}
function formatDateTime(value){
  if (!value) return '-';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  const pad = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()+', '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
}
function eventSummary(event){
  const parts = [];
  if (event.status) parts.push(event.status);
  if (event.progress && event.progress !== '-') parts.push('进度 '+event.progress);
  if (Number(event.gained || 0) > 0) parts.push('本次 +'+Number(event.gained || 0)+'分');
  if (event.message) parts.push(event.message);
  return parts.join(' | ') || '-';
}
function taskTimeline(){
  const events = Array.isArray(state.taskEvents) ? state.taskEvents : [];
  if (!events.length) return '<div class="empty-state">暂无结构化任务事件</div>';
  return '<div class="task-timeline">'+events.map(event => '<div class="task-event">'
    + '<div><strong>'+esc(formatDateTime(event.updatedAt))+'</strong><small>'+esc(event.account || '-')+'</small></div>'
    + '<div><strong>'+esc(event.task || '-')+'</strong><small>'+esc(event.message || '-')+'</small></div>'
    + '<div><strong>'+esc(event.status || '-')+'</strong><small>'+esc(event.stage || '-')+'</small></div>'
    + '<div><strong>'+esc(event.progress || '-')+'</strong><small>进度</small></div>'
    + '<div><strong class="event-points">'+(Number(event.gained || 0) > 0 ? '+'+Number(event.gained || 0)+'分' : '-')+'</strong><small>'+esc(eventSummary(event))+'</small></div>'
    + '</div>').join('')+'</div>';
}
function latestTaskMessage(){
  const events = Array.isArray(state.taskEvents) ? state.taskEvents : [];
  const event = events.find(item => item && (item.message || item.task));
  return event ? (event.account + ' | ' + event.task + ' | ' + eventSummary(event)) : (state.runState?.lastMessage || '-');
}
function currentPointsLabel(group){
  const current = Number(group.currentPoints || group.finalPoints || 0);
  const initial = Number(group.initialPoints || 0);
  const point = state.pointToday?.[group.key] || {};
  const today = Number(point.todayGained || 0);
  const run = Number(point.runGained || 0);
  if (current <= 0 && initial <= 0) return '当前总积分未获取';
  const parts = ['当前总积分 '+current];
  if (today > 0) parts.push('今日 +'+today);
  if (run > 0) {
    parts.push('本次 +'+run);
  } else if (initial <= 0 && current > 0) {
    parts.push('本次未获取基准');
  } else {
    const delta = Math.max(0, current - initial);
    if (delta > 0) parts.push('本次 +'+delta);
  }
  return parts.join('，');
}
function progressRow(item){
  const total = Number(item.total || 0);
  const completed = Number(item.completed || 0);
  const gained = Number(item.gained || 0);
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(completed / total * 100))) : (completed > 0 ? 100 : 0);
  return '<div class="progress-row"><strong>'+esc(item.label)+'</strong><div><div class="progress-bar"><div class="progress-fill" style="width:'+percent+'%"></div></div><small class="progress-status">'+esc(item.status || '')+'</small></div><span>'+completed+'/'+total+'</span><span class="progress-points">本次+'+gained+'分</span></div>';
}
function detailRow(item){
  const progress = Number(item.total || 0) > 0 ? Number(item.completed || 0)+'/'+Number(item.total || 0) : '-';
  return '<tr><td>'+esc(item.label)+'</td><td>'+esc(item.status || '-')+'</td><td>'+progress+'</td><td>+'+Number(item.gained || 0)+'</td><td>'+esc(item.message || '-')+'</td></tr>';
}
function taskDetails(group){
  const details = Array.isArray(group.details) ? [...group.details].sort((a,b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))) : [];
  if (!details.length) return '<div class="empty-state">暂无具体任务明细</div>';
  return '<div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>具体任务</th><th>状态</th><th>进度</th><th>本次积分</th><th>说明</th></tr></thead><tbody>'+details.map(detailRow).join('')+'</tbody></table></div>';
}
function taskProgress(){
  const groups = Array.isArray(state.taskProgress) ? state.taskProgress : [];
  if (!groups.length) return '<div class="empty-state">暂无账号任务进度</div>';
  return '<div class="progress-list">'+groups.map(group => '<article class="progress-account"><div class="progress-heading"><div><h3>'+esc(group.accountLabel)+'</h3><small class="progress-status">当前执行：'+esc(group.currentTask || '等待运行')+' · '+esc(group.currentMessage || '')+'</small></div><span>'+esc(currentPointsLabel(group))+'</span></div><div class="progress-items">'+group.items.map(progressRow).join('')+'</div>'+taskDetails(group)+'</article>').join('')+'</div>';
}
function runControls(){
  const r = state.runState;
  const modeLabel = r.mode === 'account-check' ? '账号检测' : '执行任务';
  const disabled = r.running ? 'disabled' : '';
  const conflict = r.running ? (r.conflictReason || '已有任务正在运行') : '空闲，可启动新任务';
  const accountOptions = state.accounts.map(a => '<option value="'+a.runAccountIndex+'">账号 '+a.runAccountIndex+' · '+esc(a.maskedEmail || '未填写邮箱')+'</option>').join('');
  return '<section class="card section"><div class="toolbar"><div><h2>运行控制</h2><p class="section-note">正式任务开始前会做登录和 dashboard 读取，这是任务前置登录验证；账号检测按钮只验证登录和仪表盘读取，不执行搜索任务。</p></div><div class="top-actions"><button id="checkAccountsBtn" class="ghost-btn" '+disabled+'>检测账号状态</button><button id="runOnceBtn" class="primary-btn" '+disabled+'>立即执行一次</button></div></div>'
    + '<div class="form-grid" style="margin-bottom:16px"><div class="field"><label>运行模式</label><select id="runAccountMode" '+disabled+'><option value="continue">继续未完成账号</option><option value="failed">只重跑失败账号</option><option value="account">重跑指定账号</option><option value="all">强制全量重跑</option></select></div><div class="field"><label>指定账号</label><select id="runAccountIndex" '+disabled+'>'+accountOptions+'</select></div></div>'
    + '<div class="settings-list">'
    + setting('运行状态', r.running ? modeLabel + '中' : '空闲')
    + setting('运行来源', r.running ? sourceLabel(r.source) : '-')
    + setting('账号模式', r.running ? accountModeLabel(r.accountMode) + (r.accountLabel ? ' ' + esc(r.accountLabel) : (r.accountIndex ? ' #' + r.accountIndex : '')) : '默认继续未完成账号')
    + setting('实际账号数', r.running ? String(r.selectedCount || 0) + '/' + String(r.totalAccounts || state.accounts.length) : '-')
    + setting('PID', r.pid || '-')
    + setting('开始时间', formatDateTime(r.startedAt))
    + setting('运行时长', fmtDuration(r.ageSeconds))
    + setting('锁状态', (r.lockOwnerAlive ? '持有中' : '未持有') + (r.lockFile ? ' | ' + r.lockFile : ''))
    + setting('最近消息', latestTaskMessage())
    + setting('启动限制', conflict)
    + '</div>'+taskTimeline()+'</section>';
}
function scheduleForm(){
  return '<form id="scheduleForm" class="card section"><h2>定时设置</h2><p class="section-note">填写 5 段 cron 表达式，保存后容器内 cron 会即时重载。例：0 7 * * *</p><div class="form-grid"><div class="field"><label>CRON_SCHEDULE</label><input name="schedule" value="'+esc(state.schedule.schedule)+'" placeholder="0 7 * * *"></div><div class="field"><label>时区</label><input value="'+esc(state.schedule.timezone)+'" disabled></div></div><div class="modal-actions"><button class="primary-btn">保存定时</button></div></form>';
}
let currentHistoryDays = 7;
window.switchHistoryRange = function(days){
  currentHistoryDays = days;
  document.querySelectorAll('.chart-pill').forEach(btn => {
    btn.classList.toggle('active', Number(btn.getAttribute('data-days')) === days);
  });
  loadAndRenderHistoryChart(days);
};

async function loadAndRenderHistoryChart(days = currentHistoryDays){
  const container = el('historyChartContainer');
  if (!container) return;
  try {
    const range = days === 7 ? 'week' : 'month';
    const res = await api('/api/points-calendar?range=' + range);
    const records = Array.isArray(res.calendar) ? res.calendar : (Array.isArray(res.records) ? res.records : []);
    const dailyMap = new Map();
    for (const r of records) {
      const d = r.dateKey || r.date || '';
      if (!d) continue;
      dailyMap.set(d, (dailyMap.get(d) || 0) + Number(r.todayGained || r.gained || 0));
    }
    const sortedDates = Array.from(dailyMap.keys()).sort().slice(-days);
    if (!sortedDates.length) {
      container.innerHTML = '<div class="empty-state">暂无历史积分趋势数据</div>';
      return;
    }
    const maxVal = Math.max(1, ...sortedDates.map(d => dailyMap.get(d)));
    container.innerHTML = '<div class="chart-bars-row">' + sortedDates.map(d => {
      const val = dailyMap.get(d);
      const heightPercent = Math.max(14, Math.round((val / maxVal) * 100));
      const shortDate = d.length >= 10 ? d.slice(5) : d;
      return '<div class="chart-col" title="' + d + '：新增 +' + val + ' 积分">'
        + '<div class="chart-val">+' + val + '</div>'
        + '<div class="chart-bar-track"><div class="chart-bar-fill" style="height:' + heightPercent + '%"></div></div>'
        + '<div class="chart-date">' + shortDate + '</div>'
        + '</div>';
    }).join('') + '</div>';
  } catch (err) {
    container.innerHTML = '<div class="empty-state">加载历史趋势失败: ' + esc(err.message) + '</div>';
  }
}

function renderDashboard(){
  const s = state.stats;
  const groups = Array.isArray(state.taskProgress) ? state.taskProgress : [];
  let totalTodayGained = 0;
  let totalCurrentBalance = 0;
  let totalTasksCompleted = 0;
  let totalTasksCount = 0;

  for (const g of groups) {
    const point = state.pointToday?.[g.key] || {};
    totalTodayGained += Number(point.todayGained || g.gainedPoints || 0);
    totalCurrentBalance += Number(g.currentPoints || g.finalPoints || 0);
    for (const item of (g.items || [])) {
      totalTasksCount++;
      if (item.status === '已完成' || (item.total > 0 && item.completed >= item.total)) {
        totalTasksCompleted++;
      }
    }
  }
  const completionRate = totalTasksCount > 0 ? Math.round((totalTasksCompleted / totalTasksCount) * 100) : 0;
  const isRunning = state.runState?.running;
  const runStatusText = isRunning ? '⚡ 执行中' : '待命中';
  const runStatusHint = isRunning ? (state.runState.mode === 'account-check' ? '正在检测账号状态' : '正在执行任务') : ('Cron: ' + (state.schedule?.schedule || '0 9,15 * * *'));

  el('dashboard').innerHTML = '<div class="content-grid">'
    + '<div class="metrics">'
    + metric('今日增加积分', '+' + totalTodayGained, '多账号累计到账', '🌟', 'hero-earned')
    + metric('当前总积分', totalCurrentBalance > 0 ? totalCurrentBalance.toLocaleString() : '--', '已同步微软账户', '💰', 'hero-accent')
    + metric('任务达成率', completionRate + '%', totalTasksCompleted + ' / ' + totalTasksCount + ' 项已完成', '🎯', 'hero-gold')
    + metric('托管账号数', s.accounts + ' 个', '脱敏展示与独立会话', '👥')
    + metric('运行状态', runStatusText, runStatusHint, isRunning ? '⚡' : '◷')
    + '</div>'
    + '<div class="split-grid"><section class="card section"><div class="toolbar"><div><h2>账号设置</h2><p class="section-note">密码、TOTP 与代理密码保存后不在页面回显；状态检测会先验证账号是否能登录。</p></div>'+accountActions()+'</div>'+accountTable(3)+'</section>'
    + '<section class="card section"><h2>任务配置</h2><p class="section-note">常用任务开关与执行参数。</p><form id="dashboardTaskForm" class="switch-row">'+taskToggles(3)+'<div class="modal-actions"><button class="primary-btn">保存配置</button></div></form></section></div>'
    + '<section class="card section"><h2>任务进度</h2><p class="section-note">按账号展示本次运行的搜索进度、当前执行任务和具体活动明细。</p>'+taskProgress()+'</section>'
    + '<section class="card section history-chart-card"><div class="toolbar"><div><h2>📈 每日积分增长历史趋势</h2><p class="section-note">直观查看过去各周期内每日积分到账收益。</p></div><div class="chart-controls"><button class="chart-pill active" data-days="7" onclick="switchHistoryRange(7)">7 日</button><button class="chart-pill" data-days="30" onclick="switchHistoryRange(30)">30 日</button></div></div><div class="chart-container" id="historyChartContainer"><div class="empty-state">加载中...</div></div></section>'
    + runControls()
    + '</div>';
  document.querySelector('#dashboardTaskForm')?.addEventListener('submit', saveConfig);
  document.querySelector('#runOnceBtn')?.addEventListener('click', runOnceNow);
  document.querySelector('#checkAccountsBtn')?.addEventListener('click', checkAccountStatus);
  document.querySelector('#runAccountMode')?.addEventListener('change', updateRunAccountSelect);
  document.querySelector('#runAccountIndex')?.addEventListener('change', function(){
    const mode = el('runAccountMode');
    if (mode) mode.value = 'account';
    updateRunAccountSelect();
  });
  updateRunAccountSelect();
  loadAndRenderHistoryChart(currentHistoryDays);
}
function renderAccounts(){
  el('accounts').innerHTML = '<div class="content-grid"><section class="card section"><div class="toolbar"><div><h2>账号设置</h2><p class="section-note">列表只展示脱敏邮箱、配置状态和账号检测结果。</p></div>'+accountActions()+'</div>'+accountTable()+'</section></div>';
}
window.openAccount = function(id){
  const a = id === undefined ? {} : state.accounts.find(x => x.id === id);
  const modal = el('modal');
  modal.classList.remove('hidden');
  modal.innerHTML = '<form class="modal-card" id="accountForm"><h2>'+(id===undefined?'新增账号':'编辑账号')+'</h2><input type="hidden" name="id" value="'+(id ?? '')+'"><div class="form-grid">'
    + field('email','邮箱','', 'email', id === undefined ? 'name@example.com' : '留空则保持 '+(a?.maskedEmail || '原邮箱'))
    + field('password','密码', '', 'password', id === undefined ? '必填' : '留空则保持原密码')
    + field('totpSecret','TOTP Secret','')
    + field('recoveryEmail','恢复邮箱','')
    + field('geoLocale','地区',a?.geoLocale || 'auto')
    + field('langCode','语言',a?.langCode || 'zh')
    + field('proxyUrl','代理地址',a?.proxyHost || '')
    + field('proxyPort','代理端口',a?.proxyPort || 0, 'number')
    + field('proxyUsername','代理用户名',a?.proxyUsername || '')
    + field('proxyPassword','代理密码','', 'password', '留空则保持原代理密码')
    + '</div><div class="modal-actions"><button type="button" class="ghost-btn" onclick="closeModal()">取消</button><button class="primary-btn">保存</button></div></form>';
  document.querySelector('#accountForm').addEventListener('submit', saveAccount);
}
function field(name,label,value,type='text',placeholder=''){return '<div class="field"><label>'+label+'</label><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" placeholder="'+placeholder+'"></div>'}
function textAreaField(name,label,value,placeholder=''){return '<div class="field full"><label>'+label+'</label><textarea name="'+name+'" placeholder="'+placeholder+'">'+esc(value)+'</textarea></div>'}
window.closeModal = function(){ el('modal').classList.add('hidden'); el('modal').innerHTML = ''; }
async function saveAccount(event){
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  if (data.id === '') delete data.id;
  data.proxyPort = Number(data.proxyPort || 0);
  data.saveFingerprintMobile = true; data.saveFingerprintDesktop = true; data.proxyAxios = Boolean(data.proxyUrl);
  await api('/api/accounts', {method:'POST', body:JSON.stringify(data)});
  closeModal(); await loadState(); switchView('accounts');
}
window.deleteAccount = async function(id){
  if (!confirm('确认删除该账号？')) return;
  await api('/api/accounts/'+id, {method:'DELETE'});
  await loadState(); switchView('accounts');
}
function renderTasks(){
  const c = state.config;
  const g = c.giftCardMonitor || {};
  const keywords = Array.isArray(g.keywords) ? g.keywords.join('\\n') : '';
  const disabled = state.runState?.running ? 'disabled' : '';
  const accountOptions = (state.accounts || []).map(a => '<option value="'+(Number(a.id)+1)+'">账号 '+(Number(a.id)+1)+' · '+esc(a.maskedEmail)+'</option>').join('');
  el('tasks').innerHTML = '<div class="content-grid">'+scheduleForm()+'<form id="taskForm">'
    + '<section class="card section"><div class="toolbar"><div><h2>任务配置</h2><p class="section-note">保存后会写入本地配置文件。</p></div><div class="top-actions"><select id="claimBonusAccount" '+disabled+'><option value="all">全部账号</option>'+accountOptions+'</select><button type="button" id="claimBonusNowBtn" class="primary-btn" '+disabled+'>立即领取奖励积分</button></div></div><div class="switch-row">'+taskToggles()+'</div><div class="form-grid" style="margin-top:16px">'+field('clusters','集群数',c.clusters,'number')+field('globalTimeout','全局超时',c.globalTimeout)+field('searchDelayMin','搜索最小延迟',c.searchSettings.searchDelay.min)+field('searchDelayMax','搜索最大延迟',c.searchSettings.searchDelay.max)+field('readDelayMin','阅读最小延迟',c.searchSettings.readDelay.min)+field('readDelayMax','阅读最大延迟',c.searchSettings.readDelay.max)+'</div></section>'
    + '<section class="card section"><h2>礼品卡监控</h2><p class="section-note">按关键词监控积分商城礼品卡；发现可兑换目标时复用已启用的推送通道发送消息。</p><div class="switch-row">'
    + '<label class="toggle"><span>启用礼品卡监控</span><input type="checkbox" name="giftCardMonitorEnabled" '+(g.enabled?'checked':'')+'></label>'
    + '<label class="toggle"><span>仅在积分足够时推送</span><input type="checkbox" name="giftCardRequireEnoughPoints" '+(g.requireEnoughPoints?'checked':'')+'></label>'
    + '<label class="toggle"><span>同一 SKU 每个账号只推送一次</span><input type="checkbox" name="giftCardNotifyOnce" '+(g.notifyOnce !== false?'checked':'')+'></label>'
    + '</div><div class="form-grid" style="margin-top:16px">'
    + textAreaField('giftCardKeywords','监控关键词',keywords,'每行一个，例如：盒马\\n天猫超市\\n肯德基')
    + field('giftCardShopUrl','商城入口',g.shopUrl || 'https://rewards.bing.com/redeem/cn?section=shop')
    + '</div><div class="modal-actions"><button class="primary-btn">保存配置</button></div></section></form></div>';
  document.querySelector('#taskForm').addEventListener('submit', saveConfig);
  document.querySelector('#tasks #scheduleForm').addEventListener('submit', saveSchedule);
  document.querySelector('#claimBonusNowBtn')?.addEventListener('click', claimBonusNow);
}
function pointsAccountOptions(){
  const source = pointsCalendarData?.accounts || [];
  const accountOptions = source.length
    ? source.map(a => '<option value="'+esc(a.id)+'">'+esc(a.label)+'</option>').join('')
    : (state.accounts || []).map(a => '<option value="" disabled>'+esc('账号 '+(Number(a.id)+1)+' · '+a.maskedEmail)+'</option>').join('');
  return '<option value="all">全部账号</option>'+accountOptions;
}
function renderPointsCalendar(){
  const section = el('pointsCalendar');
  if (!section) return;
  const body = pointsCalendarData ? pointsCalendarContent(pointsCalendarData) : '<section class="card section"><div class="empty-state">积分日历等待加载</div></section>';
  section.innerHTML = '<div class="content-grid"><section class="card section"><div class="toolbar"><div><h2>积分日历</h2><p class="section-note">按账号和时间范围统计 todayGained（当天累计）与 runGained（本次执行），历史保存在本地 logs/points-history.json。</p></div><div class="top-actions"><button id="refreshPointsBtn" class="ghost-btn">刷新</button></div></div>'
    + '<div class="points-filter-grid">'
    + '<div class="field"><label>账号</label><select id="pointsAccount">'+pointsAccountOptions()+'</select></div>'
    + '<div class="field"><label>范围</label><select id="pointsRange"><option value="week">本周</option><option value="month">本月</option><option value="quarter">本季度</option><option value="year">本年</option><option value="custom">自定义</option></select></div>'
    + '<div class="field"><label>开始日期</label><input id="pointsStart" type="date"></div>'
    + '<div class="field"><label>结束日期</label><input id="pointsEnd" type="date"></div>'
    + '<button id="applyPointsFilterBtn" class="primary-btn">应用筛选</button>'
    + '</div></section>'+body+'</div>';
  el('pointsAccount').value = pointsFilters.account;
  if (el('pointsAccount').value !== pointsFilters.account) el('pointsAccount').value = 'all';
  el('pointsRange').value = pointsFilters.range;
  el('pointsStart').value = pointsFilters.start || pointsCalendarData?.range?.start || '';
  el('pointsEnd').value = pointsFilters.end || pointsCalendarData?.range?.end || '';
  el('refreshPointsBtn')?.addEventListener('click', () => loadPointsCalendar().catch(err => renderPointsCalendarError(err.message)));
  el('applyPointsFilterBtn')?.addEventListener('click', applyPointsFilters);
  el('pointsRange')?.addEventListener('change', event => {
    pointsFilters.range = event.target.value;
  });
  el('pointsAccount')?.addEventListener('change', event => { pointsFilters.account = event.target.value || 'all'; });
  el('pointsStart')?.addEventListener('change', event => { pointsFilters.start = event.target.value || ''; });
  el('pointsEnd')?.addEventListener('change', event => { pointsFilters.end = event.target.value || ''; });
}
function pointsCalendarContent(data){
  const summary = data.summary || {};
  const highest = summary.highestPointDay || {};
  return '<div class="metrics">'
    + metric('总积分', '+'+Number(summary.totalPoints || 0), (data.range?.start || '-')+' 至 '+(data.range?.end || '-'), '▦')
    + metric('平均每日', Number(summary.averageDailyPoints || 0), '按当前筛选范围计算', '≈')
    + metric('完成天数', Number(summary.completedDays || 0), '完成或部分完成', '✓')
    + metric('最高积分日', highest.date ? '+'+Number(highest.points || 0) : '-', highest.date || '暂无记录', '↑')
    + '</div>'
    + '<section class="card section"><div class="toolbar"><div><h2>日历视图</h2><p class="section-note">颜色越深表示当天获得积分越多；空白代表未运行或无记录。</p></div><span class="env-pill">'+esc(rangeLabel(data.range?.preset))+'</span></div>'+pointsCalendarGrid(data.days || [])+'</section>'
    + '<section class="card section"><div class="toolbar"><div><h2>明细表格</h2><p class="section-note">按账号和日期展示分类积分；展开可查看同一天多次执行的 run 记录。</p></div><span class="env-pill">'+Number((data.records || []).length)+' 条</span></div>'+pointsRecordsTable(data.records || [])+'</section>';
}
function rangeLabel(value){
  return value === 'week' ? '本周' : value === 'quarter' ? '本季度' : value === 'year' ? '本年' : value === 'custom' ? '自定义' : '本月';
}
function statusLabel(value){
  return value === 'completed' ? '完成' : value === 'partial' ? '部分完成' : value === 'failed' ? '失败' : value === 'skipped' ? '跳过' : '未运行';
}
const pointCategoryLabels = {pcSearch:'PC搜索', mobileSearch:'移动搜索', dailyActivity:'每日活动', appActivity:'App活动', checkIn:'签到', readToEarn:'阅读赚取', bonus:'奖励领取', streak:'连击保护', other:'其他'};
function categoryChips(categories){
  const entries = Object.entries(pointCategoryLabels).map(([key,label]) => ({label, value:Number(categories?.[key] || 0)}));
  const visible = entries.filter(item => item.value > 0);
  if (!visible.length) return '<span class="category-chip">无分类积分</span>';
  return visible.map(item => '<span class="category-chip">'+esc(item.label)+' +'+item.value+'</span>').join('');
}
function pointsCalendarGrid(days){
  if (!days.length) return '<div class="empty-state">暂无日期范围</div>';
  const max = Math.max(1, ...days.map(day => Number(day.totalGained || 0)));
  return '<div class="calendar-grid">'+days.map(day => {
    const points = Number(day.totalGained || 0);
    const alpha = points > 0 ? Math.max(0.1, Math.min(0.48, points / max * 0.48)) : 0;
    const style = points > 0 ? ' style="background:rgba(15,143,133,'+alpha.toFixed(2)+')"' : '';
    return '<article class="calendar-cell '+(points > 0 ? '' : 'is-empty')+'"'+style+'><strong>'+esc(day.date)+'</strong><b>+'+points+'</b><span>'+esc(statusLabel(day.status))+' · '+Number(day.records || 0)+' 账号</span></article>';
  }).join('')+'</div>';
}
function pointRecordRow(record, index){
  const runs = Array.isArray(record.runs) ? record.runs : [];
  const runRows = runs.length ? '<tr class="runs-panel"><td colspan="10"><details><summary>查看 '+runs.length+' 次执行记录</summary><div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>开始</th><th>结束</th><th>任务前</th><th>任务后</th><th>runGained</th><th>状态</th><th>来源</th><th>明细</th></tr></thead><tbody>'+runs.map(run => '<tr><td>'+esc(run.startedAt || '-')+'</td><td>'+esc(run.finishedAt || '-')+'</td><td>'+Number(run.beforePoints || 0)+'</td><td>'+Number(run.afterPoints || 0)+'</td><td>+'+Number(run.runGained || 0)+'</td><td>'+esc(statusLabel(run.status))+'</td><td>'+esc(run.source || '-')+'</td><td>'+runTaskSummary(run.taskSummary)+'</td></tr>').join('')+'</tbody></table></div></details></td></tr>' : '';
  return '<tr><td>'+esc(record.date)+'</td><td>'+esc(record.accountLabel)+'</td><td>'+Number(record.beforePoints || 0)+'</td><td>'+Number(record.afterPoints || 0)+'</td><td>+'+Number(record.todayGained || 0)+'</td><td>+'+Number(record.runGained || 0)+'</td><td><div class="category-list">'+categoryChips(record.categories || {})+'</div></td><td><span class="status-pill state-'+safeStateClass(record.status)+'">'+esc(statusLabel(record.status))+'</span></td><td>'+esc(record.updatedAt || '-')+'</td><td>'+(runs.length ? '<span class="pill">'+runs.length+' 次</span>' : '-')+'</td></tr>'+runRows;
}
function runTaskSummary(items){
  if (!Array.isArray(items) || !items.length) return '-';
  return items.slice(-8).map(item => esc(item.label || '任务')+' +'+Number(item.gained || 0)).join('<br>');
}
function pointsRecordsTable(records){
  if (!records.length) return '<div class="empty-state">当前筛选范围没有积分记录</div>';
  const rows = records.map(pointRecordRow).join('');
  return '<div class="table-wrap"><table class="table points-table"><thead><tr><th>日期</th><th>账号</th><th>任务前</th><th>任务后</th><th>todayGained</th><th>runGained</th><th>分类积分</th><th>状态</th><th>最后更新</th><th>Runs</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
async function applyPointsFilters(){
  pointsFilters.account = el('pointsAccount')?.value || 'all';
  pointsFilters.range = el('pointsRange')?.value || 'month';
  pointsFilters.start = el('pointsStart')?.value || '';
  pointsFilters.end = el('pointsEnd')?.value || '';
  await loadPointsCalendar();
}
function pointsQueryString(){
  const params = new URLSearchParams({account:pointsFilters.account, range:pointsFilters.range});
  if (pointsFilters.range === 'custom') {
    if (pointsFilters.start) params.set('start', pointsFilters.start);
    if (pointsFilters.end) params.set('end', pointsFilters.end);
  }
  return params.toString();
}
async function loadPointsCalendar(){
  const container = el('pointsCalendar');
  if (container && !pointsCalendarData) {
    container.innerHTML = '<div class="content-grid"><section class="card section"><div class="empty-state">正在加载积分日历...</div></section></div>';
  }
  pointsCalendarData = await api('/api/points-calendar?' + pointsQueryString(), {headers:{}});
  if (pointsCalendarData?.range) {
    if (pointsFilters.range === 'custom') {
      pointsFilters.start = pointsCalendarData.range.start || pointsFilters.start;
      pointsFilters.end = pointsCalendarData.range.end || pointsFilters.end;
    }
  }
  renderPointsCalendar();
}
function renderPointsCalendarError(message){
  const section = el('pointsCalendar');
  if (section) section.innerHTML = '<div class="content-grid"><section class="card section"><div class="empty-state">积分日历加载失败：'+esc(message || '未知错误')+'</div></section></div>';
}
function renderLogs(){
  el('logs').innerHTML = '<div class="content-grid"><section class="card section"><div class="toolbar"><div><h2>运行日志</h2><p class="section-note">只展示服务端脱敏后的日志；邮箱、Token、Cookie、IP 和长密钥会被隐藏。</p></div><div class="top-actions"><button id="refreshLogsBtn" class="ghost-btn">刷新</button><button id="downloadLogsBtn" class="primary-btn">下载脱敏日志</button></div></div>'
    + '<div class="filter-grid">'
    + '<div class="field"><label>来源</label><select id="logSource"><option value="manual">Web/最近运行</option><option value="runtime">容器运行日志</option></select></div>'
    + '<div class="field"><label>级别</label><select id="logLevel"><option value="all">全部</option><option value="error">错误</option><option value="warn">警告</option><option value="info">信息</option><option value="debug">调试</option></select></div>'
    + '<div class="field"><label>行数</label><select id="logTail"><option value="200">200</option><option value="500">500</option><option value="1000">1000</option></select></div>'
    + '<div class="field"><label>搜索</label><input id="logQuery" placeholder="关键词"></div>'
    + '</div><div class="top-actions" style="margin-top:14px"><label class="toggle" style="min-height:40px;padding:8px 12px"><span>自动刷新</span><input id="logAutoRefresh" type="checkbox"></label><span id="logStatus" class="env-pill">等待加载</span></div><div id="logViewer" class="log-box large" style="margin-top:16px"></div></section></div>';
  el('logSource').value = logFilters.source;
  el('logLevel').value = logFilters.level;
  el('logTail').value = logFilters.tail;
  el('logQuery').value = logFilters.query;
  el('logAutoRefresh').checked = logFilters.autoRefresh;
  ['logSource','logLevel','logTail'].forEach(id => el(id).addEventListener('change', onLogFilterChange));
  el('logQuery').addEventListener('input', debounce(onLogFilterChange, 300));
  el('logAutoRefresh').addEventListener('change', event => { logFilters.autoRefresh = event.target.checked; updateLogPolling('logs'); });
  el('refreshLogsBtn').addEventListener('click', () => loadLogs().catch(err => showLogMessage(err.message)));
  el('downloadLogsBtn').addEventListener('click', downloadLogs);
}
function debounce(fn, wait){
  let timer = null;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}
function onLogFilterChange(){
  logFilters.source = el('logSource').value;
  logFilters.level = el('logLevel').value;
  logFilters.tail = el('logTail').value;
  logFilters.query = el('logQuery').value;
  loadLogs().catch(err => showLogMessage(err.message));
}
function logQueryString(){
  return new URLSearchParams({source:logFilters.source, level:logFilters.level, tail:logFilters.tail, query:logFilters.query}).toString();
}
function showLogMessage(message){
  const viewer = el('logViewer');
  if (viewer) viewer.textContent = message || '日志加载失败';
  const status = el('logStatus');
  if (status) status.textContent = '加载失败';
}
async function loadLogs(){
  if (!el('logViewer')) return;
  const result = await api('/api/logs?' + logQueryString(), {headers:{}});
  const lines = Array.isArray(result.lines) ? result.lines : [];
  el('logStatus').textContent = result.count + ' 行 | 已脱敏';
  el('logViewer').innerHTML = lines.length
    ? lines.map(line => '<span class="log-line '+esc(line.level || 'info')+'">'+esc(line.text)+'</span>').join('')
    : '<span class="log-line">暂无匹配日志</span>';
}
function updateLogPolling(activeView){
  if (activeView === 'logs' && logFilters.autoRefresh && !logPollTimer) {
    logPollTimer = setInterval(() => loadLogs().catch(() => {}), 3000);
  }
  if ((activeView !== 'logs' || !logFilters.autoRefresh) && logPollTimer) {
    clearInterval(logPollTimer);
    logPollTimer = null;
  }
}
function downloadLogs(){
  location.href = '/api/logs/download?' + logQueryString();
}
function renderWeCom(){
  const w = state.wecom || {};
  const secretHint = w.hasCorpSecret ? '已配置，不回显；填写新值会覆盖' : '请输入企业微信应用 Secret';
  el('wecom').innerHTML = '<div class="content-grid">'
    + '<div class="metrics">'
    + metric('推送状态', w.enabled ? '已启用' : '未启用', w.hasCorpSecret ? '密钥已保存' : '缺少 corpsecret', '✉')
    + metric('最近测试', '手动触发', '点击测试推送后查看企业微信', '✓')
    + metric('反代模式', w.proxyMode === 'qinglong' ? '青龙反代' : '直连', w.proxyBaseUrl || 'qyapi.weixin.qq.com', '↔')
    + metric('失败通知', '日志脱敏', '不会显示 token 或 secret', '◇')
    + '</div>'
    + '<section class="card section"><div class="toolbar"><div><h2>企业微信推送</h2><p class="section-note">账号任务完成后立即推送该账号的任务明细、任务前总积分、任务后总积分和本次增加积分。</p></div><div class="top-actions"><button id="wecomDiagnoseBtn" class="ghost-btn">网络诊断</button><button id="wecomTestBtn" class="ghost-btn">测试推送</button><button id="wecomClearBtn" class="danger-btn">清空配置</button></div></div>'
    + '<form id="wecomForm"><div class="switch-row"><label class="toggle"><span>启用企业微信推送</span><input type="checkbox" name="enabled" '+(w.enabled?'checked':'')+'></label></div>'
    + '<div class="form-grid" style="margin-top:16px">'
    + field('corpId','corpid',w.corpId || '')
    + field('agentId','agentid',w.agentId || '')
    + field('corpSecret','corpsecret','', 'password', secretHint)
    + field('toUser','touser',w.toUser || '@all')
    + '<div class="field"><label>代理模式</label><select name="proxyMode"><option value="direct" '+(w.proxyMode !== 'qinglong'?'selected':'')+'>直连</option><option value="qinglong" '+(w.proxyMode === 'qinglong'?'selected':'')+'>青龙反代</option></select></div>'
    + field('proxyBaseUrl','API 代理地址',w.proxyBaseUrl || '', 'text', '例如 https://example.com')
    + '</div><p id="wecomMessage" class="form-message" aria-live="polite"></p><div class="modal-actions"><button class="primary-btn">保存配置</button></div></form></section>'
    + '</div>';
  wecomDirty = false;
  const form = document.querySelector('#wecomForm');
  form.addEventListener('submit', saveWeCom);
  form.addEventListener('input', () => { if (!wecomSaving) wecomDirty = true; });
  form.addEventListener('change', () => { if (!wecomSaving) wecomDirty = true; });
  document.querySelector('#wecomDiagnoseBtn').addEventListener('click', diagnoseWeComPush);
  document.querySelector('#wecomTestBtn').addEventListener('click', testWeComPush);
  document.querySelector('#wecomClearBtn').addEventListener('click', clearWeCom);
}
async function saveConfig(event){
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  data.workers = {};
  Object.keys(state.config.workers).forEach(k => {
    if (form.elements[k]) data.workers[k] = Boolean(form.elements[k].checked);
  });
  if (form.elements.giftCardMonitorEnabled) {
    data.giftCardMonitorEnabled = Boolean(form.elements.giftCardMonitorEnabled.checked);
    data.giftCardRequireEnoughPoints = Boolean(form.elements.giftCardRequireEnoughPoints?.checked);
    data.giftCardNotifyOnce = Boolean(form.elements.giftCardNotifyOnce?.checked);
  }
  data.clusters = Number(data.clusters || 1);
  await api('/api/config', {method:'POST', body:JSON.stringify(data)});
  await loadState(); switchView('tasks');
}
async function saveWeCom(event){
  event.preventDefault();
  const form = event.target;
  const message = el('wecomMessage');
  const data = Object.fromEntries(new FormData(form).entries());
  data.enabled = Boolean(form.elements.enabled.checked);
  const missing = validateWeComForm(data);
  if (missing.length > 0) {
    message.textContent = '企业微信配置缺少或无效：' + missing.join('、');
    return;
  }
  wecomSaving = true;
  message.textContent = '正在保存企业微信配置...';
  try {
    await api('/api/wecom', {method:'POST', body:JSON.stringify(data)});
    wecomDirty = false;
    message.textContent = '已保存企业微信配置';
    await loadState(); switchView('wecom');
  } catch (error) {
    message.textContent = error.message;
  } finally {
    wecomSaving = false;
  }
}
function validateWeComForm(data){
  if (!data.enabled) return [];
  const missing = [];
  if (!String(data.corpId || '').trim()) missing.push('corpid');
  if (!/^\\d+$/.test(String(data.agentId || '').trim())) missing.push('agentid');
  if (!String(data.corpSecret || '').trim() && !state.wecom?.hasCorpSecret) missing.push('corpsecret');
  if (!String(data.toUser || '').trim()) missing.push('touser');
  return missing;
}
async function testWeComPush(){
  const message = el('wecomMessage');
  message.textContent = '正在发送测试推送...';
  try {
    const result = await api('/api/wecom/test', {method:'POST', body:'{}'});
    message.textContent = result.message || '测试推送已发送';
  } catch (error) {
    message.textContent = error.message;
  }
}
async function diagnoseWeComPush(){
  const message = el('wecomMessage');
  message.textContent = '正在进行网络诊断...';
  try {
    const result = await api('/api/wecom/diagnose', {method:'POST', body:'{}'});
    message.textContent = result.message || '网络诊断完成';
  } catch (error) {
    message.textContent = error.message;
  }
}
async function clearWeCom(){
  if (!confirm('确认清空企业微信推送配置？')) return;
  await api('/api/wecom/clear', {method:'POST', body:'{}'});
  await loadState(); switchView('wecom');
}
async function runOnceNow(){
  try {
    const accountMode = el('runAccountMode')?.value || 'continue';
    const accountIndex = accountMode === 'account' ? Number(el('runAccountIndex')?.value || 0) : undefined;
    await api('/api/run', {method:'POST', body:JSON.stringify({accountMode, ...(accountIndex ? {accountIndex} : {})})});
  } catch (error) {
    alert(error.message);
  }
  await loadState();
  updateRunPolling();
  switchView('dashboard');
}
async function claimBonusNow(){
  try {
    const accountValue = el('claimBonusAccount')?.value || 'all';
    const accountIndex = Number(accountValue || 0);
    const body = accountValue === 'all'
      ? {accountMode:'all', manualTask:'claim-bonus-points'}
      : {accountMode:'account', accountIndex, manualTask:'claim-bonus-points'};
    await api('/api/run', {method:'POST', body:JSON.stringify(body)});
  } catch (error) {
    alert(error.message);
  }
  await loadState();
  updateRunPolling();
  switchView('dashboard');
}
function updateRunAccountSelect(){
  const mode = el('runAccountMode')?.value || 'continue';
  const select = el('runAccountIndex');
  if (select) select.disabled = Boolean(state?.runState?.running);
}
async function checkAccountStatus(){
  try {
    await api('/api/account-status/check', {method:'POST', body:'{}'});
  } catch (error) {
    alert(error.message);
  }
  await loadState();
  updateRunPolling();
  switchView('dashboard');
}
async function saveSchedule(event){
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  await api('/api/schedule', {method:'POST', body:JSON.stringify(data)});
  await loadState();
  switchView('tasks');
}
function renderSystem(){ el('system').innerHTML = '<div class="content-grid">'+scheduleForm()+'<section class="card section"><h2>系统设置</h2><p class="section-note">基础运行环境信息。</p>'+settingsItems()+'<div class="table-wrap" style="margin-top:18px"><table class="table"><tr><th>运行目录</th><td>'+esc(state.runtime.root)+'</td></tr><tr><th>Node 环境</th><td>'+esc(state.runtime.nodeEnv)+'</td></tr><tr><th>Web 端口</th><td>'+esc(state.runtime.webPort)+'</td></tr></table></div></section></div>'; document.querySelector('#system #scheduleForm').addEventListener('submit', saveSchedule); }
loadState().catch(err => alert(err.message));`;
}
async function handleRequest(req, res) {
    try {
        const url = new url_1.URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        if (url.pathname.startsWith('/api/')) {
            await handleApi(req, res, url);
            return;
        }
        if (url.pathname !== '/') {
            notFound(res);
            return;
        }
        const auth = getConfiguredAuth();
        const session = getSession(req);
        if (!auth || !session) {
            send(res, 200, loginHtml(!auth));
            return;
        }
        send(res, 200, appHtml());
    }
    catch (error) {
        sendJson(res, 500, {
            error: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error)
        });
    }
}
function matchCronField(expr, val) {
    if (expr === '*' || expr === '?') return true;
    for (const part of expr.split(',')) {
        const trimmed = part.trim();
        if (trimmed.includes('/')) {
            const [range, stepStr] = trimmed.split('/');
            const step = parseInt(stepStr, 10);
            if (!step || isNaN(step)) continue;
            if (range === '*' || range === '') {
                if (val % step === 0) return true;
            } else if (range.includes('-')) {
                const [min, max] = range.split('-').map(Number);
                if (val >= min && val <= max && (val - min) % step === 0) return true;
            }
        } else if (trimmed.includes('-')) {
            const [min, max] = trimmed.split('-').map(Number);
            if (val >= min && val <= max) return true;
        } else if (parseInt(trimmed, 10) === val) {
            return true;
        }
    }
    return false;
}
function matchesCron(schedule, date) {
    const fields = schedule.trim().split(/\s+/);
    if (fields.length !== 5) return false;
    const [m, h, dom, mon, dow] = fields;
    return (
        matchCronField(m, date.getMinutes()) &&
        matchCronField(h, date.getHours()) &&
        matchCronField(dom, date.getDate()) &&
        matchCronField(mon, date.getMonth() + 1) &&
        matchCronField(dow, date.getDay())
    );
}
function getNowInTimezone(tz) {
    try {
        const str = new Date().toLocaleString('en-US', { timeZone: tz });
        return new Date(str);
    } catch {
        return new Date();
    }
}
let lastCronMinuteKey = '';
function startInternalScheduler() {
    console.log('[scheduler] 内置定时调度引擎已启动 (每20秒自检调度)');
    setInterval(() => {
        try {
            const schedInfo = currentSchedule();
            const sched = schedInfo?.schedule;
            if (!sched || typeof sched !== 'string') return;
            const tz = schedInfo?.timezone || process.env.TZ || 'Asia/Shanghai';
            const now = getNowInTimezone(tz);
            const minuteKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            if (minuteKey === lastCronMinuteKey) return;
            if (matchesCron(sched, now)) {
                lastCronMinuteKey = minuteKey;
                console.log(`[scheduler] 定时任务触发 (CRON: "${sched}", 时区: ${tz}, 当前时间: ${minuteKey})`);
                const currentRun = mergedRunState();
                if (currentRun.running && (currentRun.ageSeconds ?? 0) > 7200) {
                    console.log(`[scheduler] 检测到前次任务已运行超过 2 小时 (${currentRun.ageSeconds}s)，判定为卡死，强制清理旧进程并启动`);
                    if (currentRun.pid) {
                        try { process.kill(-currentRun.pid, 'SIGKILL'); } catch {}
                        try { process.kill(currentRun.pid, 'SIGKILL'); } catch {}
                    }
                    try {
                        const { execSync } = require('child_process');
                        execSync("pkill -9 -f '[n]ode .*dist/index\\.js' || true", { stdio: 'ignore' });
                        execSync("pkill -9 -f 'chrome-headless-shell' || true", { stdio: 'ignore' });
                        execSync("pkill -9 -f '[n]pm start' || true", { stdio: 'ignore' });
                    } catch {}
                    try { fs_1.default.unlinkSync(runLockFile); } catch {}
                    try { fs_1.default.unlinkSync(runLockMetaFile); } catch {}
                    runState = { running: false, lastMessage: '前次任务超时被自动清理' };
                }
                if (!mergedRunState().running) {
                    startScriptRun('task', { accountMode: 'continue', source: 'cron' });
                } else {
                    console.log('[scheduler] 已有任务正在运行中，本次定时触发跳过');
                }
            }
        } catch (e) {
            console.error('[scheduler] 调度自检异常:', e.message);
        }
    }, 20000);
}
function start() {
    ensureRuntimeFiles();
    startInternalScheduler();
    const port = Number(process.env.WEB_UI_PORT ?? process.env.PORT ?? 3000);
    const host = process.env.WEB_UI_HOST ?? '0.0.0.0';
    http_1.default.createServer((req, res) => {
        void handleRequest(req, res);
    }).listen(port, host, () => {
        console.log(`[web] Microsoft Rewards Script UI listening on http://${host}:${port}`);
        if (!getConfiguredAuth()) {
            console.log('[web] First-run setup is required before project content is visible.');
        }
    });
}
start();
//# sourceMappingURL=server.js.map