"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readRunCheckpointFile = readRunCheckpointFile;
exports.selectAccountsForRun = selectAccountsForRun;
exports.selectAccountsWithoutCheckpoint = selectAccountsWithoutCheckpoint;
exports.validateRunAccountIndex = validateRunAccountIndex;
exports.syncRunCheckpointFromAccountCheck = syncRunCheckpointFromAccountCheck;
exports.updateRunCheckpoint = updateRunCheckpoint;
exports.markRunningCheckpointsInterrupted = markRunningCheckpointsInterrupted;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const TaskProgressStore_1 = require("./TaskProgressStore");
const DateUtils_1 = require("./DateUtils");
const checkpointFile = path_1.default.join(process.cwd(), 'logs', 'run-checkpoint.json');
function todayKey() {
    return (0, DateUtils_1.localDateKey)();
}
function emptyCheckpointFile() {
    return { version: 1, date: todayKey(), updatedAt: new Date().toISOString(), accounts: [] };
}
function sanitizeText(value) {
    return value
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
        .replace(/\b(password|passwd|pwd|token|secret|cookie|authorization)(\s*[:=]\s*)([^\s|]+)/gi, '$1$2[REDACTED]');
}
function isCheckpointState(value) {
    return (value === 'pending' ||
        value === 'running' ||
        value === 'completed' ||
        value === 'failed' ||
        value === 'interrupted' ||
        value === 'skipped');
}
function readCheckpointFile() {
    try {
        if (!fs_1.default.existsSync(checkpointFile))
            return emptyCheckpointFile();
        const parsed = JSON.parse(fs_1.default.readFileSync(checkpointFile, 'utf8'));
        if (parsed.date !== todayKey() || !Array.isArray(parsed.accounts)) {
            return emptyCheckpointFile();
        }
        return {
            version: 1,
            date: parsed.date,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
            accounts: parsed.accounts.filter((item) => typeof item.accountHash === 'string' &&
                isCheckpointState(item.state) &&
                typeof item.currentTask === 'string' &&
                typeof item.currentStep === 'string' &&
                typeof item.lastMessage === 'string' &&
                typeof item.updatedAt === 'string')
        };
    }
    catch {
        return emptyCheckpointFile();
    }
}
function writeCheckpointFile(data) {
    data.updatedAt = new Date().toISOString();
    fs_1.default.mkdirSync(path_1.default.dirname(checkpointFile), { recursive: true });
    fs_1.default.writeFileSync(checkpointFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
function defaultCheckpoint(accountHash) {
    return {
        accountHash,
        state: 'pending',
        currentTask: '等待运行',
        currentStep: 'pending',
        lastMessage: '等待运行',
        updatedAt: new Date().toISOString()
    };
}
function checkpointFor(data, email) {
    const accountHash = (0, TaskProgressStore_1.accountProgressHash)(email);
    let account = data.accounts.find(item => item.accountHash === accountHash);
    if (!account) {
        account = defaultCheckpoint(accountHash);
        data.accounts.push(account);
    }
    return account;
}
function pendingMessage(mode) {
    switch (mode) {
        case 'failed':
            return '只重跑失败账号，等待执行';
        case 'all':
            return '强制全量重跑，等待执行';
        case 'account':
            return '重跑指定账号，等待执行';
        case 'continue':
        default:
            return '继续未完成账号，等待执行';
    }
}
function markStaleRunning(account) {
    if (account.state !== 'running')
        return false;
    const now = new Date().toISOString();
    account.state = 'interrupted';
    account.currentTask = '上次运行中断';
    account.currentStep = 'interrupted';
    account.lastMessage = '检测到上次任务未正常结束，等待续跑';
    account.finishedAt = now;
    account.updatedAt = now;
    return true;
}
function readRunCheckpointFile() {
    return readCheckpointFile();
}
function selectAccountsForRun(accounts, options) {
    validateRunAccountIndex(accounts.length, options.mode, options.targetAccountIndex);
    const data = readCheckpointFile();
    const selected = [];
    const skipped = [];
    let interrupted = 0;
    const now = new Date().toISOString();
    for (const account of accounts) {
        const checkpoint = checkpointFor(data, account.email);
        if (markStaleRunning(checkpoint)) {
            interrupted += 1;
        }
    }
    accounts.forEach((account, index) => {
        const checkpoint = checkpointFor(data, account.email);
        const accountIndex = index + 1;
        const shouldRun = options.mode === 'all' ||
            (options.mode === 'account' && accountIndex === options.targetAccountIndex) ||
            (options.mode === 'failed' && ['failed', 'interrupted'].includes(checkpoint.state)) ||
            (options.mode === 'continue' && checkpoint.state !== 'completed');
        if (!shouldRun) {
            skipped.push(account);
            return;
        }
        checkpoint.state = 'pending';
        checkpoint.currentTask = '等待运行';
        checkpoint.currentStep = 'pending';
        checkpoint.lastMessage = pendingMessage(options.mode);
        checkpoint.updatedAt = now;
        checkpoint.runMode = options.mode;
        checkpoint.runSource = options.runSource;
        checkpoint.pid = options.pid;
        delete checkpoint.startedAt;
        delete checkpoint.finishedAt;
        delete checkpoint.error;
        selected.push(account);
    });
    writeCheckpointFile(data);
    return {
        mode: options.mode,
        targetAccountIndex: options.targetAccountIndex,
        selected,
        skipped,
        interrupted
    };
}
function selectAccountsWithoutCheckpoint(accounts, options) {
    validateRunAccountIndex(accounts.length, options.mode, options.targetAccountIndex);
    const selected = [];
    const skipped = [];
    accounts.forEach((account, index) => {
        const accountIndex = index + 1;
        const shouldRun = options.mode === 'account' ? accountIndex === options.targetAccountIndex : true;
        if (shouldRun) {
            selected.push(account);
        }
        else {
            skipped.push(account);
        }
    });
    return {
        mode: options.mode,
        targetAccountIndex: options.targetAccountIndex,
        selected,
        skipped,
        interrupted: 0
    };
}
function validateRunAccountIndex(accountCount, mode, targetAccountIndex) {
    if (mode !== 'account')
        return;
    if (!Number.isInteger(targetAccountIndex)) {
        throw new Error('指定账号模式需要提供 1 基账号序号');
    }
    if (targetAccountIndex < 1 || targetAccountIndex > accountCount) {
        throw new Error(`运行账号序号超出范围：必须在 1..${accountCount} 之间`);
    }
}
function syncRunCheckpointFromAccountCheck(email, result) {
    updateRunCheckpoint(email, {
        state: result.hasPendingTasks ? 'pending' : 'completed',
        currentTask: result.hasPendingTasks ? '等待继续执行' : '账号任务完成',
        currentStep: 'account-check',
        lastMessage: result.message,
        runSource: result.runSource,
        runMode: 'continue',
        pid: result.pid
    });
}
function updateRunCheckpoint(email, patch) {
    const data = readCheckpointFile();
    const account = checkpointFor(data, email);
    const now = new Date().toISOString();
    account.state = patch.state ?? account.state;
    account.currentTask = patch.currentTask ? sanitizeText(patch.currentTask) : account.currentTask;
    account.currentStep = patch.currentStep ? sanitizeText(patch.currentStep) : account.currentStep;
    account.lastMessage = patch.lastMessage ? sanitizeText(patch.lastMessage) : account.lastMessage;
    account.runSource = patch.runSource ?? account.runSource;
    account.runMode = patch.runMode ?? account.runMode;
    account.pid = patch.pid ?? account.pid;
    account.updatedAt = now;
    if (patch.state === 'running') {
        account.startedAt = patch.startedAt ?? account.startedAt ?? now;
        delete account.finishedAt;
        delete account.error;
    }
    if (patch.state === 'pending') {
        delete account.startedAt;
        delete account.finishedAt;
        delete account.error;
    }
    if (patch.state === 'completed' || patch.state === 'failed' || patch.state === 'interrupted') {
        account.finishedAt = patch.finishedAt ?? now;
    }
    if (patch.error) {
        account.error = sanitizeText(patch.error);
    }
    else if (patch.state === 'completed') {
        delete account.error;
    }
    writeCheckpointFile(data);
}
function markRunningCheckpointsInterrupted(message) {
    const data = readCheckpointFile();
    const now = new Date().toISOString();
    let changed = false;
    for (const account of data.accounts) {
        if (account.state !== 'running')
            continue;
        account.state = 'interrupted';
        account.currentTask = '运行中断';
        account.currentStep = 'interrupted';
        account.lastMessage = sanitizeText(message);
        account.finishedAt = now;
        account.updatedAt = now;
        changed = true;
    }
    if (changed) {
        writeCheckpointFile(data);
    }
}
//# sourceMappingURL=RunCheckpointStore.js.map