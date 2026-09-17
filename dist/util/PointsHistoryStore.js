"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pointCategoryFor = pointCategoryFor;
exports.readPointsHistoryFile = readPointsHistoryFile;
exports.recordPointFailure = recordPointFailure;
exports.startPointRun = startPointRun;
exports.updatePointRunBaseline = updatePointRunBaseline;
exports.recordPointRunGain = recordPointRunGain;
exports.ensurePointRunCategoryMinimum = ensurePointRunCategoryMinimum;
exports.finishPointRun = finishPointRun;
exports.queryPointsCalendar = queryPointsCalendar;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const TaskProgressStore_1 = require("./TaskProgressStore");
const DateUtils_1 = require("./DateUtils");
const CATEGORY_KEYS = [
    'pcSearch',
    'mobileSearch',
    'dailyActivity',
    'appActivity',
    'checkIn',
    'readToEarn',
    'bonus',
    'streak',
    'other'
];
const historyFile = path_1.default.join(process.cwd(), 'logs', 'points-history.json');
const lockFile = `${historyFile}.lock`;
function emptyCategories() {
    return {
        pcSearch: 0,
        mobileSearch: 0,
        dailyActivity: 0,
        appActivity: 0,
        checkIn: 0,
        readToEarn: 0,
        bonus: 0,
        streak: 0,
        other: 0
    };
}
function normalizeCategories(input) {
    const next = emptyCategories();
    for (const key of CATEGORY_KEYS) {
        next[key] = Math.max(0, Math.floor(Number(input?.[key] ?? 0)));
    }
    return next;
}
function sumCategories(categories) {
    return CATEGORY_KEYS.reduce((sum, key) => sum + Math.max(0, Number(categories[key] ?? 0)), 0);
}
function addCategories(a, b) {
    const next = emptyCategories();
    for (const key of CATEGORY_KEYS) {
        next[key] = Math.max(0, Number(a[key] ?? 0)) + Math.max(0, Number(b[key] ?? 0));
    }
    return next;
}
function addCategory(categories, category, points) {
    categories[category] = Math.max(0, Number(categories[category] ?? 0)) + Math.max(0, Math.floor(points));
}
function numberValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}
function parseDateKey(value) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
        return null;
    return date;
}
function addDays(date, days) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
}
function eachDate(start, end) {
    const startDate = parseDateKey(start);
    const endDate = parseDateKey(end);
    if (!startDate || !endDate)
        return [];
    const dates = [];
    for (let cursor = startDate; cursor.getTime() <= endDate.getTime(); cursor = addDays(cursor, 1)) {
        dates.push((0, DateUtils_1.localDateKey)(cursor));
    }
    return dates;
}
function minDate(first, second) {
    return first.getTime() <= second.getTime() ? first : second;
}
function rangeForPreset(preset, start, end, now = new Date()) {
    const customStart = start ? parseDateKey(start) : null;
    const customEnd = end ? parseDateKey(end) : null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if ((preset === 'custom' || customStart || customEnd) && customStart && customEnd) {
        const first = customStart.getTime() <= customEnd.getTime() ? customStart : customEnd;
        const requestedLast = customStart.getTime() <= customEnd.getTime() ? customEnd : customStart;
        const clampedFirst = minDate(first, today);
        const last = minDate(requestedLast, today);
        return { preset: 'custom', start: (0, DateUtils_1.localDateKey)(clampedFirst), end: (0, DateUtils_1.localDateKey)(last) };
    }
    if (preset === 'week') {
        const offset = (today.getDay() + 6) % 7;
        const weekStart = addDays(today, -offset);
        return { preset, start: (0, DateUtils_1.localDateKey)(weekStart), end: (0, DateUtils_1.localDateKey)(minDate(addDays(weekStart, 6), today)) };
    }
    if (preset === 'quarter') {
        const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
        const quarterStart = new Date(today.getFullYear(), quarterStartMonth, 1);
        const quarterEnd = new Date(today.getFullYear(), quarterStartMonth + 3, 0);
        return { preset, start: (0, DateUtils_1.localDateKey)(quarterStart), end: (0, DateUtils_1.localDateKey)(minDate(quarterEnd, today)) };
    }
    if (preset === 'year') {
        return {
            preset,
            start: (0, DateUtils_1.localDateKey)(new Date(today.getFullYear(), 0, 1)),
            end: (0, DateUtils_1.localDateKey)(minDate(new Date(today.getFullYear(), 11, 31), today))
        };
    }
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { preset: 'month', start: (0, DateUtils_1.localDateKey)(monthStart), end: (0, DateUtils_1.localDateKey)(minDate(monthEnd, today)) };
}
function emptyHistoryFile() {
    return { version: 1, updatedAt: new Date().toISOString(), days: [], failures: [] };
}
function sanitizeText(value) {
    return value
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, maskEmail)
        .replace(/\b(password|passwd|pwd|token|secret|cookie|authorization|corpsecret)(\s*[:=]\s*)([^\s|]+)/gi, '$1$2[REDACTED]')
        .slice(0, 500);
}
function maskEmail(email) {
    const [name = '', domain = ''] = email.split('@');
    if (!domain)
        return email ? `${email.slice(0, 2)}***` : '';
    const left = name.length <= 2 ? `${name[0] ?? ''}***` : `${name.slice(0, 2)}***${name.slice(-1)}`;
    return `${left}@${domain}`;
}
function accountLabel(email) {
    return maskEmail(email.trim().toLowerCase());
}
function normalizeStatus(value) {
    if (value === 'completed' ||
        value === 'partial' ||
        value === 'failed' ||
        value === 'skipped' ||
        value === 'notRun') {
        return value;
    }
    return 'partial';
}
function normalizeTaskSummary(input) {
    if (!Array.isArray(input))
        return [];
    return input
        .map(item => {
        const raw = item && typeof item === 'object' ? item : {};
        return {
            key: typeof raw.key === 'string' ? sanitizeText(raw.key) : undefined,
            label: sanitizeText(String(raw.label ?? '任务')),
            gained: numberValue(raw.gained),
            status: typeof raw.status === 'string' ? sanitizeText(raw.status) : undefined
        };
    })
        .filter(item => item.label.length > 0);
}
function normalizeRun(input, day) {
    return {
        id: typeof input.id === 'string' ? input.id : newRunId(day.accountHash, day.date),
        date: typeof input.date === 'string' ? input.date : day.date,
        accountHash: day.accountHash,
        accountLabel: typeof input.accountLabel === 'string' ? sanitizeText(input.accountLabel) : day.accountLabel,
        source: typeof input.source === 'string' ? sanitizeText(input.source) : '',
        pid: numberValue(input.pid),
        startedAt: typeof input.startedAt === 'string' ? input.startedAt : new Date().toISOString(),
        finishedAt: typeof input.finishedAt === 'string' ? input.finishedAt : '',
        beforePoints: numberValue(input.beforePoints),
        afterPoints: numberValue(input.afterPoints),
        runGained: numberValue(input.runGained),
        todayGained: numberValue(input.todayGained),
        categories: normalizeCategories(input.categories),
        status: normalizeStatus(input.status),
        taskSummary: normalizeTaskSummary(input.taskSummary),
        balanceUnconfirmed: input.balanceUnconfirmed === true ? true : undefined,
        failureStage: typeof input.failureStage === 'string' ? sanitizeText(input.failureStage) : undefined,
        error: typeof input.error === 'string' ? sanitizeText(input.error) : undefined
    };
}
function normalizeFailure(input) {
    if (typeof input.accountHash !== 'string' || typeof input.stage !== 'string')
        return null;
    const date = typeof input.date === 'string' ? input.date : (0, DateUtils_1.localDateKey)();
    return {
        id: typeof input.id === 'string' ? input.id : newRunId(input.accountHash, date),
        date,
        accountHash: input.accountHash,
        accountLabel: typeof input.accountLabel === 'string' ? sanitizeText(input.accountLabel) : '账号',
        source: typeof input.source === 'string' ? sanitizeText(input.source) : '',
        pid: numberValue(input.pid),
        failedAt: typeof input.failedAt === 'string' ? input.failedAt : new Date().toISOString(),
        stage: sanitizeText(input.stage),
        error: sanitizeText(String(input.error ?? '账号运行失败'))
    };
}
function normalizeDay(input) {
    if (typeof input.date !== 'string' || typeof input.accountHash !== 'string')
        return null;
    const day = {
        date: input.date,
        accountHash: input.accountHash,
        accountLabel: typeof input.accountLabel === 'string' ? sanitizeText(input.accountLabel) : '账号',
        beforePoints: numberValue(input.beforePoints),
        afterPoints: numberValue(input.afterPoints),
        todayGained: numberValue(input.todayGained),
        runGained: numberValue(input.runGained),
        categories: normalizeCategories(input.categories),
        status: normalizeStatus(input.status),
        updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString(),
        runs: []
    };
    day.runs = Array.isArray(input.runs) ? input.runs.map(run => normalizeRun(run, day)) : [];
    recomputeDay(day);
    return day;
}
function readHistoryFile() {
    try {
        if (!fs_1.default.existsSync(historyFile))
            return emptyHistoryFile();
        const parsed = JSON.parse(fs_1.default.readFileSync(historyFile, 'utf8'));
        const days = Array.isArray(parsed.days)
            ? parsed.days.map(day => normalizeDay(day)).filter((day) => Boolean(day))
            : [];
        const failures = Array.isArray(parsed.failures)
            ? parsed.failures
                .map(failure => normalizeFailure(failure))
                .filter((failure) => Boolean(failure))
            : [];
        return {
            version: 1,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
            days,
            failures
        };
    }
    catch {
        return emptyHistoryFile();
    }
}
function writeHistoryFile(data) {
    data.updatedAt = new Date().toISOString();
    fs_1.default.mkdirSync(path_1.default.dirname(historyFile), { recursive: true });
    const tmp = `${historyFile}.${process.pid}.${Date.now()}.tmp`;
    fs_1.default.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs_1.default.renameSync(tmp, historyFile);
}
function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function withHistoryLock(fn) {
    fs_1.default.mkdirSync(path_1.default.dirname(historyFile), { recursive: true });
    const started = Date.now();
    let fd = null;
    while (fd === null) {
        try {
            fd = fs_1.default.openSync(lockFile, 'wx');
            fs_1.default.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
        }
        catch {
            try {
                const stat = fs_1.default.statSync(lockFile);
                if (Date.now() - stat.mtimeMs > 10 * 60 * 1000) {
                    fs_1.default.unlinkSync(lockFile);
                    continue;
                }
            }
            catch { }
            if (Date.now() - started > 5000) {
                throw new Error('points-history lock timeout');
            }
            sleepSync(25);
        }
    }
    try {
        return fn();
    }
    finally {
        if (fd !== null) {
            try {
                fs_1.default.closeSync(fd);
            }
            catch { }
        }
        try {
            fs_1.default.unlinkSync(lockFile);
        }
        catch { }
    }
}
function newRunId(accountHash, date = (0, DateUtils_1.localDateKey)()) {
    return `${date}-${accountHash.slice(0, 10)}-${Date.now().toString(36)}-${crypto_1.default.randomBytes(4).toString('hex')}`;
}
function dayFor(data, email, date = (0, DateUtils_1.localDateKey)()) {
    const accountHash = (0, TaskProgressStore_1.accountProgressHash)(email);
    let day = data.days.find(item => item.accountHash === accountHash && item.date === date);
    if (!day) {
        day = {
            date,
            accountHash,
            accountLabel: accountLabel(email),
            beforePoints: 0,
            afterPoints: 0,
            todayGained: 0,
            runGained: 0,
            categories: emptyCategories(),
            status: 'notRun',
            updatedAt: new Date().toISOString(),
            runs: []
        };
        data.days.push(day);
    }
    if (!day.accountLabel)
        day.accountLabel = accountLabel(email);
    return day;
}
function runFor(day, runId) {
    return day.runs.find(run => run.id === runId) ?? null;
}
function aggregateStatus(runs) {
    if (runs.length === 0)
        return 'notRun';
    const hasCompleted = runs.some(run => run.status === 'completed');
    const hasPartial = runs.some(run => run.status === 'partial');
    const hasFailed = runs.some(run => run.status === 'failed');
    const allSkipped = runs.every(run => run.status === 'skipped');
    const anyGained = runs.some(run => run.runGained > 0 || sumCategories(run.categories) > 0);
    if (hasFailed && (hasCompleted || hasPartial || anyGained))
        return 'partial';
    if (hasFailed)
        return 'failed';
    if (hasPartial)
        return 'partial';
    if (hasCompleted)
        return 'completed';
    if (allSkipped)
        return 'skipped';
    return 'notRun';
}
function recomputeDay(day) {
    const sortedRuns = [...day.runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const firstWithPoints = sortedRuns.find(run => run.beforePoints > 0);
    const latest = [...sortedRuns].sort((a, b) => {
        const left = a.finishedAt || a.startedAt;
        const right = b.finishedAt || b.startedAt;
        return right.localeCompare(left);
    })[0];
    const categories = sortedRuns.reduce((total, run) => addCategories(total, run.categories), emptyCategories());
    const runGained = sortedRuns.reduce((sum, run) => sum + Math.max(0, Number(run.runGained ?? 0)), 0);
    const beforePoints = day.beforePoints > 0 ? day.beforePoints : (firstWithPoints?.beforePoints ?? sortedRuns[0]?.beforePoints ?? 0);
    const afterPoints = latest?.afterPoints ?? day.afterPoints ?? beforePoints;
    const totalByBalance = beforePoints > 0 ? Math.max(0, afterPoints - beforePoints) : 0;
    const todayGained = Math.max(totalByBalance, runGained, sumCategories(categories));
    day.beforePoints = beforePoints;
    day.afterPoints = Math.max(afterPoints, beforePoints);
    day.runGained = runGained;
    day.todayGained = todayGained;
    day.categories = categories;
    day.status = aggregateStatus(sortedRuns);
    day.updatedAt = latest?.finishedAt || latest?.startedAt || day.updatedAt || new Date().toISOString();
    for (const run of day.runs) {
        run.todayGained = todayGained;
    }
}
function statusFromTaskSummary(status, taskSummary) {
    if (status !== 'completed')
        return status;
    const hasSkippedOrFailed = taskSummary.some(task => /跳过|失败|错误|error|failed|skipped/i.test(task.status ?? ''));
    return hasSkippedOrFailed ? 'partial' : 'completed';
}
function taskKeyToCategory(key) {
    if (key === 'desktop')
        return 'pcSearch';
    if (key === 'mobile')
        return 'mobileSearch';
    return null;
}
function pointCategoryFor(label, task = 'daily', detailLabel = '') {
    if (task === 'desktop')
        return 'pcSearch';
    if (task === 'mobile')
        return 'mobileSearch';
    const text = `${label} ${detailLabel}`.toLowerCase();
    if (/pc|桌面|desktop/.test(text) && /搜索|search/.test(text))
        return 'pcSearch';
    if (/移动|mobile/.test(text) && /搜索|search/.test(text))
        return 'mobileSearch';
    if (/阅读|read/.test(text))
        return 'readToEarn';
    if (/签到|check.?in/.test(text))
        return 'checkIn';
    if (/app|应用/.test(text))
        return 'appActivity';
    if (/奖励|bonus|claim/.test(text))
        return 'bonus';
    if (/连击|streak/.test(text))
        return 'streak';
    if (/每日|daily|urlreward|quiz|测验|活动|推广|打卡|punch|findclippy|必应搜索活动/.test(text))
        return 'dailyActivity';
    return 'other';
}
function readPointsHistoryFile() {
    return readHistoryFile();
}
function recordPointFailure(email, failure) {
    return withHistoryLock(() => {
        const data = readHistoryFile();
        const date = (0, DateUtils_1.localDateKey)();
        const accountHash = (0, TaskProgressStore_1.accountProgressHash)(email);
        const id = newRunId(accountHash, date);
        data.failures.push({
            id,
            date,
            accountHash,
            accountLabel: accountLabel(email),
            source: sanitizeText(failure.source ?? ''),
            pid: numberValue(failure.pid),
            failedAt: new Date().toISOString(),
            stage: sanitizeText(failure.stage),
            error: sanitizeText(failure.error)
        });
        writeHistoryFile(data);
        return id;
    });
}
function startPointRun(email, beforePoints, options = {}) {
    return withHistoryLock(() => {
        const data = readHistoryFile();
        const date = (0, DateUtils_1.localDateKey)();
        const day = dayFor(data, email, date);
        const runId = newRunId(day.accountHash, date);
        const now = new Date().toISOString();
        const safeBefore = numberValue(beforePoints);
        const run = {
            id: runId,
            date,
            accountHash: day.accountHash,
            accountLabel: day.accountLabel,
            source: sanitizeText(options.source ?? ''),
            pid: numberValue(options.pid),
            startedAt: now,
            finishedAt: '',
            beforePoints: safeBefore,
            afterPoints: safeBefore,
            runGained: 0,
            todayGained: day.todayGained,
            categories: emptyCategories(),
            status: 'partial',
            taskSummary: []
        };
        day.runs.push(run);
        if (day.beforePoints === 0 && safeBefore > 0)
            day.beforePoints = safeBefore;
        day.afterPoints = Math.max(day.afterPoints, safeBefore);
        day.updatedAt = now;
        recomputeDay(day);
        writeHistoryFile(data);
        return runId;
    });
}
function updatePointRunBaseline(email, runId, beforePoints) {
    if (!runId)
        return;
    withHistoryLock(() => {
        const data = readHistoryFile();
        const day = dayFor(data, email);
        const run = runFor(day, runId);
        if (!run)
            return;
        const safeBefore = numberValue(beforePoints);
        run.beforePoints = safeBefore;
        if (run.afterPoints === 0)
            run.afterPoints = safeBefore;
        if (day.beforePoints === 0 || day.beforePoints > safeBefore)
            day.beforePoints = safeBefore;
        day.accountLabel = accountLabel(email);
        run.accountLabel = day.accountLabel;
        day.updatedAt = new Date().toISOString();
        recomputeDay(day);
        writeHistoryFile(data);
    });
}
function recordPointRunGain(email, runId, label, category, gained, balance) {
    if (!runId)
        return;
    const safeGained = numberValue(gained);
    if (safeGained <= 0 && balance === undefined)
        return;
    withHistoryLock(() => {
        const data = readHistoryFile();
        const day = dayFor(data, email);
        const run = runFor(day, runId);
        if (!run)
            return;
        addCategory(run.categories, category, safeGained);
        run.runGained += safeGained;
        if (balance !== undefined) {
            run.afterPoints = Math.max(run.afterPoints, numberValue(balance));
        }
        else {
            run.afterPoints = Math.max(run.afterPoints, run.beforePoints + run.runGained);
        }
        run.taskSummary.push({
            key: category,
            label: sanitizeText(label),
            gained: safeGained,
            status: safeGained > 0 ? '已记录' : '无新增'
        });
        run.status = 'partial';
        day.updatedAt = new Date().toISOString();
        recomputeDay(day);
        writeHistoryFile(data);
    });
}
function ensurePointRunCategoryMinimum(email, runId, label, category, minimumGained, balance) {
    if (!runId)
        return;
    const minimum = numberValue(minimumGained);
    if (minimum <= 0)
        return;
    withHistoryLock(() => {
        const data = readHistoryFile();
        const day = dayFor(data, email);
        const run = runFor(day, runId);
        if (!run)
            return;
        const current = numberValue(run.categories[category]);
        const delta = Math.max(0, minimum - current);
        if (delta > 0) {
            addCategory(run.categories, category, delta);
            run.runGained += delta;
            run.taskSummary.push({
                key: category,
                label: sanitizeText(label),
                gained: delta,
                status: '补齐分类'
            });
        }
        if (balance !== undefined) {
            run.afterPoints = Math.max(run.afterPoints, numberValue(balance));
        }
        day.updatedAt = new Date().toISOString();
        recomputeDay(day);
        writeHistoryFile(data);
    });
}
function finishPointRun(email, runId, patch) {
    if (!runId)
        return;
    withHistoryLock(() => {
        const data = readHistoryFile();
        const day = dayFor(data, email);
        const run = runFor(day, runId);
        if (!run)
            return;
        const beforePoints = numberValue(patch.beforePoints, run.beforePoints);
        const afterPoints = numberValue(patch.afterPoints, run.afterPoints);
        const runGained = patch.runGained !== undefined ? numberValue(patch.runGained) : Math.max(0, afterPoints - beforePoints);
        const summary = normalizeTaskSummary(patch.taskSummary);
        const existingCategoryTotal = sumCategories(run.categories);
        run.beforePoints = beforePoints;
        run.afterPoints = Math.max(afterPoints, beforePoints);
        run.runGained = Math.max(run.runGained, runGained);
        run.finishedAt = new Date().toISOString();
        run.status = statusFromTaskSummary(patch.status, summary);
        run.taskSummary = [...run.taskSummary, ...summary];
        if (patch.balanceUnconfirmed !== undefined)
            run.balanceUnconfirmed = patch.balanceUnconfirmed;
        if (patch.failureStage)
            run.failureStage = sanitizeText(patch.failureStage);
        if (patch.error)
            run.error = sanitizeText(patch.error);
        if (existingCategoryTotal === 0 && summary.length > 0) {
            for (const item of summary) {
                const category = taskKeyToCategory(item.key) ?? pointCategoryFor(item.label);
                addCategory(run.categories, category, item.gained);
            }
        }
        const missing = Math.max(0, run.runGained - sumCategories(run.categories));
        if (missing > 0) {
            addCategory(run.categories, 'other', missing);
        }
        if (day.beforePoints === 0 || beforePoints < day.beforePoints)
            day.beforePoints = beforePoints;
        day.accountLabel = accountLabel(email);
        run.accountLabel = day.accountLabel;
        day.updatedAt = run.finishedAt;
        recomputeDay(day);
        writeHistoryFile(data);
    });
}
function emptyCalendarRecord(account, date) {
    return {
        accountId: account.id,
        accountLabel: account.label,
        date,
        beforePoints: 0,
        afterPoints: 0,
        todayGained: 0,
        runGained: 0,
        categories: emptyCategories(),
        status: 'notRun',
        updatedAt: '',
        runs: []
    };
}
function publicRun(run) {
    const publicValue = { ...run };
    delete publicValue.accountHash;
    return publicValue;
}
function publicRecord(account, date, saved) {
    if (!saved)
        return emptyCalendarRecord(account, date);
    return {
        accountId: account.id,
        accountLabel: account.label,
        date,
        beforePoints: saved.beforePoints,
        afterPoints: saved.afterPoints,
        todayGained: saved.todayGained,
        runGained: saved.runGained,
        categories: normalizeCategories(saved.categories),
        status: saved.status,
        updatedAt: saved.updatedAt,
        runs: saved.runs
            .map(publicRun)
            .sort((a, b) => String(b.finishedAt || b.startedAt).localeCompare(String(a.finishedAt || a.startedAt)))
    };
}
function aggregateCalendarDay(date, records) {
    const categories = records.reduce((total, record) => addCategories(total, record.categories), emptyCategories());
    const totalGained = records.reduce((sum, record) => sum + Math.max(0, Number(record.todayGained ?? 0)), 0);
    const statuses = records.map(record => record.status);
    const status = statuses.includes('failed')
        ? totalGained > 0 || statuses.includes('completed') || statuses.includes('partial')
            ? 'partial'
            : 'failed'
        : statuses.includes('partial')
            ? 'partial'
            : statuses.includes('completed')
                ? 'completed'
                : statuses.every(item => item === 'skipped')
                    ? 'skipped'
                    : 'notRun';
    return { date, totalGained, categories, status, records: records.length };
}
function hasPointRecordValue(record) {
    return (record.todayGained > 0 ||
        record.runGained > 0 ||
        sumCategories(record.categories) > 0 ||
        record.runs.some(run => run.runGained > 0 || sumCategories(run.categories) > 0));
}
function normalizeRangePreset(value) {
    if (value === 'week' || value === 'month' || value === 'quarter' || value === 'year' || value === 'custom') {
        return value;
    }
    return 'month';
}
function queryPointsCalendar(accounts, options = {}) {
    const preset = normalizeRangePreset(options.range);
    const range = rangeForPreset(preset, options.start, options.end, options.now);
    const history = readHistoryFile();
    const accountFilter = String(options.account ?? 'all');
    const selectedAccounts = accountFilter === 'all'
        ? accounts
        : accounts.filter(account => account.id === accountFilter || account.accountHash === accountFilter);
    const finalAccounts = selectedAccounts;
    const dates = eachDate(range.start, range.end);
    const records = [];
    for (const date of dates) {
        for (const account of finalAccounts) {
            const saved = history.days.find(day => day.date === date && day.accountHash === account.accountHash);
            records.push(publicRecord(account, date, saved));
        }
    }
    const days = dates.map(date => aggregateCalendarDay(date, records.filter(record => record.date === date)));
    const visibleRecords = records.filter(hasPointRecordValue);
    const totalPoints = days.reduce((sum, day) => sum + day.totalGained, 0);
    const averageDailyPoints = dates.length > 0 ? Math.round((totalPoints / dates.length) * 10) / 10 : 0;
    const completedDays = days.filter(day => day.status === 'completed' || day.status === 'partial').length;
    const failedDays = days.filter(day => day.status === 'failed' || day.status === 'partial').length;
    const highest = days.reduce((best, day) => (day.totalGained > best.points ? { date: day.date, points: day.totalGained } : best), { date: '', points: 0 });
    return {
        accounts: finalAccounts.map(account => ({ id: account.id, label: account.label })),
        range,
        summary: {
            totalPoints,
            averageDailyPoints,
            completedDays,
            failedDays,
            highestPointDay: highest
        },
        days,
        records: visibleRecords.sort((a, b) => {
            const dateOrder = b.date.localeCompare(a.date);
            return dateOrder !== 0 ? dateOrder : a.accountLabel.localeCompare(b.accountLabel);
        })
    };
}
//# sourceMappingURL=PointsHistoryStore.js.map