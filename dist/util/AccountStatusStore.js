"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAccountStatusFile = readAccountStatusFile;
exports.updateAccountStatus = updateAccountStatus;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const TaskProgressStore_1 = require("./TaskProgressStore");
const statusFile = path_1.default.join(process.cwd(), 'logs', 'account-status.json');
function emptyStatusFile() {
    return { version: 1, accounts: [] };
}
function readStatusFile() {
    try {
        if (!fs_1.default.existsSync(statusFile))
            return emptyStatusFile();
        const parsed = JSON.parse(fs_1.default.readFileSync(statusFile, 'utf8'));
        if (!Array.isArray(parsed.accounts))
            return emptyStatusFile();
        return {
            version: 1,
            accounts: parsed.accounts.filter((item) => typeof item.accountHash === 'string' &&
                typeof item.state === 'string' &&
                typeof item.stage === 'string' &&
                typeof item.lastMessage === 'string' &&
                typeof item.updatedAt === 'string')
        };
    }
    catch {
        return emptyStatusFile();
    }
}
function writeStatusFile(data) {
    fs_1.default.mkdirSync(path_1.default.dirname(statusFile), { recursive: true });
    fs_1.default.writeFileSync(statusFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
function defaultAccountStatus(accountHash) {
    return {
        accountHash,
        state: 'unknown',
        stage: 'created',
        lastMessage: '尚未检测',
        updatedAt: new Date().toISOString()
    };
}
function sanitizeStatusText(value) {
    return value
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
        .replace(/\b(password|passwd|pwd|token|secret|cookie|authorization)(\s*[:=]\s*)([^\s|]+)/gi, '$1$2[REDACTED]');
}
function readAccountStatusFile() {
    return readStatusFile();
}
function updateAccountStatus(email, patch) {
    const data = readStatusFile();
    const accountHash = (0, TaskProgressStore_1.accountProgressHash)(email);
    const now = new Date().toISOString();
    let account = data.accounts.find(item => item.accountHash === accountHash);
    if (!account) {
        account = defaultAccountStatus(accountHash);
        data.accounts.push(account);
    }
    account.state = patch.state ?? account.state;
    account.stage = patch.stage ? sanitizeStatusText(patch.stage) : account.stage;
    account.lastMessage = patch.lastMessage ? sanitizeStatusText(patch.lastMessage) : account.lastMessage;
    account.updatedAt = now;
    if (patch.state === 'checking') {
        account.lastCheckedAt = now;
    }
    if (patch.state === 'valid' || patch.state === 'running' || patch.state === 'success') {
        account.lastSuccessAt = now;
        delete account.error;
    }
    if (patch.state === 'error') {
        account.lastFailureAt = now;
        const error = patch.error ?? patch.lastMessage ?? account.error;
        account.error = error ? sanitizeStatusText(error) : error;
    }
    writeStatusFile(data);
}
//# sourceMappingURL=AccountStatusStore.js.map