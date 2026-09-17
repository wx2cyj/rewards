"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountProgressHash = accountProgressHash;
exports.taskDetailKey = taskDetailKey;
exports.readTaskProgressFile = readTaskProgressFile;
exports.updateTaskProgress = updateTaskProgress;
exports.updateAccountTaskProgress = updateAccountTaskProgress;
exports.updateAccountPointTotals = updateAccountPointTotals;
exports.resetAccountRunProgress = resetAccountRunProgress;
exports.updateAccountRunState = updateAccountRunState;
exports.updateAccountRunFailure = updateAccountRunFailure;
exports.updateTaskDetail = updateTaskDetail;
exports.recordTaskDetailGain = recordTaskDetailGain;
exports.updateSearchTaskProgress = updateSearchTaskProgress;
exports.updateSearchTaskFailure = updateSearchTaskFailure;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DateUtils_1 = require("./DateUtils");
const progressFile = path_1.default.join(process.cwd(), 'logs', 'task-progress.json');
function todayKey() {
    return (0, DateUtils_1.localDateKey)();
}
function emptyItem(status = '等待运行') {
    return { completed: 0, total: 0, gained: 0, status };
}
function emptyAccount(accountHash) {
    return {
        accountHash,
        updatedAt: new Date().toISOString(),
        initialPoints: 0,
        currentPoints: 0,
        finalPoints: 0,
        currentTask: '等待运行',
        currentStage: 'idle',
        currentMessage: '等待运行',
        desktop: emptyItem(),
        mobile: emptyItem(),
        daily: emptyItem(),
        details: []
    };
}
function readProgressFile() {
    try {
        if (!fs_1.default.existsSync(progressFile)) {
            return { date: todayKey(), accounts: [] };
        }
        const parsed = JSON.parse(fs_1.default.readFileSync(progressFile, 'utf8'));
        if (parsed.date !== todayKey() || !Array.isArray(parsed.accounts)) {
            return { date: todayKey(), accounts: [] };
        }
        return { date: parsed.date, accounts: parsed.accounts };
    }
    catch {
        return { date: todayKey(), accounts: [] };
    }
}
function writeProgressFile(data) {
    fs_1.default.mkdirSync(path_1.default.dirname(progressFile), { recursive: true });
    fs_1.default.writeFileSync(progressFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
function accountProgressHash(email) {
    return crypto_1.default.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
function taskDetailKey(label) {
    const ascii = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return ascii || crypto_1.default.createHash('sha1').update(label.trim()).digest('hex').slice(0, 12);
}
function readTaskProgressFile() {
    return readProgressFile();
}
function getAccount(data, email) {
    const accountHash = accountProgressHash(email);
    let account = data.accounts.find(item => item.accountHash === accountHash);
    if (!account) {
        account = emptyAccount(accountHash);
        data.accounts.push(account);
    }
    account.currentTask = account.currentTask ?? '等待运行';
    account.currentStage = account.currentStage ?? 'idle';
    account.currentMessage = account.currentMessage ?? account.currentTask;
    account.details = Array.isArray(account.details) ? account.details : [];
    return account;
}
function updateTaskProgress(email, task, patch) {
    const data = readProgressFile();
    const account = getAccount(data, email);
    account[task] = {
        ...account[task],
        ...patch,
        completed: Math.max(0, Number(patch.completed ?? account[task].completed ?? 0)),
        total: Math.max(0, Number(patch.total ?? account[task].total ?? 0)),
        gained: Math.max(0, Number(patch.gained ?? account[task].gained ?? 0)),
        status: patch.status ?? account[task].status
    };
    account.updatedAt = new Date().toISOString();
    writeProgressFile(data);
}
function updateAccountTaskProgress(email, patch) {
    for (const [task, item] of Object.entries(patch)) {
        updateTaskProgress(email, task, item);
    }
}
function updateAccountPointTotals(email, patch) {
    const data = readProgressFile();
    const account = getAccount(data, email);
    account.initialPoints = Math.max(0, Number(patch.initialPoints ?? account.initialPoints ?? 0));
    account.currentPoints = Math.max(0, Number(patch.currentPoints ?? account.currentPoints ?? 0));
    account.finalPoints = Math.max(0, Number(patch.finalPoints ?? account.finalPoints ?? 0));
    account.updatedAt = new Date().toISOString();
    writeProgressFile(data);
}
function resetAccountRunProgress(email, points) {
    const data = readProgressFile();
    const account = getAccount(data, email);
    account.initialPoints = Math.max(0, Number(points.initialPoints ?? account.initialPoints ?? 0));
    account.currentPoints = Math.max(0, Number(points.currentPoints ?? account.currentPoints ?? 0));
    account.finalPoints = Math.max(0, Number(points.finalPoints ?? account.finalPoints ?? account.currentPoints ?? 0));
    account.currentTask = '准备执行';
    account.currentStage = 'start';
    account.currentMessage = '账号已登录，准备执行任务';
    account.desktop = emptyItem();
    account.mobile = emptyItem();
    account.daily = emptyItem();
    account.details = [];
    account.updatedAt = new Date().toISOString();
    writeProgressFile(data);
}
function updateAccountRunState(email, patch) {
    const data = readProgressFile();
    const account = getAccount(data, email);
    account.currentTask = patch.currentTask ?? account.currentTask;
    account.currentStage = patch.currentStage ?? account.currentStage;
    account.currentMessage = patch.currentMessage ?? account.currentMessage;
    account.updatedAt = new Date().toISOString();
    writeProgressFile(data);
}
function updateAccountRunFailure(email, stage, message) {
    const data = readProgressFile();
    const account = getAccount(data, email);
    const now = new Date().toISOString();
    const safeStage = sanitizeProgressMessage(stage) || 'account-error';
    const safeMessage = sanitizeProgressMessage(message);
    const isLoginFailure = safeStage.startsWith('login-') || safeStage.startsWith('bing-session-');
    const detailKey = isLoginFailure ? 'login-failure' : 'account-failure';
    const label = isLoginFailure ? '登录验证' : '账号运行';
    account.currentTask = `${label}失败`;
    account.currentStage = safeStage;
    account.currentMessage = safeMessage;
    let detail = account.details.find(item => item.key === detailKey);
    if (!detail) {
        detail = {
            key: detailKey,
            label,
            group: 'activity',
            completed: 0,
            total: 0,
            gained: 0,
            status: '失败',
            message: safeMessage,
            updatedAt: now
        };
        account.details.push(detail);
    }
    else {
        detail.status = '失败';
        detail.message = safeMessage;
        detail.updatedAt = now;
    }
    account.updatedAt = now;
    writeProgressFile(data);
}
function updateTaskDetail(email, detail) {
    const data = readProgressFile();
    const account = getAccount(data, email);
    const now = new Date().toISOString();
    let item = account.details.find(entry => entry.key === detail.key);
    if (!item) {
        item = {
            key: detail.key,
            label: detail.label,
            group: detail.group,
            completed: 0,
            total: 0,
            gained: 0,
            status: '等待运行',
            message: '',
            updatedAt: now
        };
        account.details.push(item);
    }
    item.label = detail.label ?? item.label;
    item.group = detail.group ?? item.group;
    item.completed = Math.max(0, Number(detail.completed ?? item.completed ?? 0));
    item.total = Math.max(0, Number(detail.total ?? item.total ?? 0));
    item.gained = Math.max(0, Number(detail.gained ?? item.gained ?? 0));
    item.status = detail.status ?? item.status;
    item.message = detail.message ?? item.message;
    item.updatedAt = now;
    account.updatedAt = now;
    writeProgressFile(data);
}
function recordTaskDetailGain(email, detail, gained, message = '') {
    const data = readProgressFile();
    const account = getAccount(data, email);
    const now = new Date().toISOString();
    let item = account.details.find(entry => entry.key === detail.key);
    if (!item) {
        item = {
            key: detail.key,
            label: detail.label,
            group: detail.group,
            completed: 0,
            total: 0,
            gained: 0,
            status: '等待运行',
            message: '',
            updatedAt: now
        };
        account.details.push(item);
    }
    const safeGained = Math.max(0, Number.isFinite(Number(gained)) ? Number(gained) : 0);
    item.label = detail.label;
    item.group = detail.group;
    item.gained = Math.max(0, Number(item.gained ?? 0)) + safeGained;
    item.completed = item.gained;
    item.total = Math.max(item.total, item.gained);
    item.status = safeGained > 0 ? `+${safeGained}` : item.status;
    item.message = message || item.message;
    item.updatedAt = now;
    account.updatedAt = now;
    writeProgressFile(data);
}
function updateSearchTaskProgress(email, task, gained, remaining, fallbackTotal) {
    const data = readProgressFile();
    const account = getAccount(data, email);
    const current = account[task];
    const total = current.total > 0 ? current.total : fallbackTotal;
    const completedFromRemaining = total > 0 ? Math.max(0, Math.min(total, total - remaining)) : gained;
    const completed = Math.max(current.completed ?? 0, completedFromRemaining);
    account[task] = {
        completed,
        total,
        gained: Math.max(current.gained, gained),
        status: remaining > 0 ? '进行中' : '已完成'
    };
    const label = task === 'desktop' ? 'PC搜索' : '移动搜索';
    const detailKey = task === 'desktop' ? 'desktop-search' : 'mobile-search';
    const now = new Date().toISOString();
    let detail = account.details.find(item => item.key === detailKey);
    if (!detail) {
        detail = {
            key: detailKey,
            label,
            group: task,
            completed: 0,
            total: 0,
            gained: 0,
            status: '等待运行',
            message: '',
            updatedAt: now
        };
        account.details.push(detail);
    }
    detail.completed = completed;
    detail.total = total;
    detail.gained = Math.max(detail.gained, gained);
    detail.status = remaining > 0 ? '进行中' : '已完成';
    detail.message = remaining > 0 ? `剩余 ${remaining}，进度 ${completed}/${total}` : '搜索已完成';
    detail.updatedAt = now;
    account.updatedAt = new Date().toISOString();
    writeProgressFile(data);
}
function sanitizeProgressMessage(value) {
    return value
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
        .replace(/\b(password|passwd|pwd|token|secret|cookie|authorization)(\s*[:=]\s*)([^\s|]+)/gi, '$1$2[REDACTED]')
        .slice(0, 500);
}
function updateSearchTaskFailure(email, task, patch) {
    const data = readProgressFile();
    const account = getAccount(data, email);
    const current = account[task];
    const completed = Math.max(0, current.completed ?? 0, Number(patch.completed ?? 0));
    const total = Math.max(completed, current.total ?? 0, Number(patch.total ?? 0));
    const message = sanitizeProgressMessage(patch.message);
    const label = task === 'desktop' ? 'PC搜索' : '移动搜索';
    const detailKey = task === 'desktop' ? 'desktop-search' : 'mobile-search';
    const now = new Date().toISOString();
    account[task] = {
        ...current,
        completed,
        total,
        status: '失败'
    };
    let detail = account.details.find(item => item.key === detailKey);
    if (!detail) {
        detail = {
            key: detailKey,
            label,
            group: task,
            completed,
            total,
            gained: current.gained,
            status: '失败',
            message,
            updatedAt: now
        };
        account.details.push(detail);
    }
    else {
        detail.completed = completed;
        detail.total = total;
        detail.gained = Math.max(detail.gained, current.gained);
        detail.status = '失败';
        detail.message = message;
        detail.updatedAt = now;
    }
    account.currentTask = label;
    account.currentStage = `${task}-search-failed`;
    account.currentMessage = message;
    account.updatedAt = now;
    writeProgressFile(data);
    return account[task];
}
//# sourceMappingURL=TaskProgressStore.js.map