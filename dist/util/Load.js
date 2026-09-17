"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAccounts = loadAccounts;
exports.loadConfig = loadConfig;
exports.loadSessionData = loadSessionData;
exports.saveSessionData = saveSessionData;
exports.saveFingerprintData = saveFingerprintData;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Validator_1 = require("./Validator");
let configCache;
function loadAccounts() {
    try {
        let file = 'accounts.json';
        if (process.argv.includes('-dev')) {
            file = 'accounts.dev.json';
        }
        const accountDir = path_1.default.join(__dirname, '../', file);
        const accounts = fs_1.default.readFileSync(accountDir, 'utf-8');
        const accountsData = JSON.parse(accounts);
        (0, Validator_1.validateAccounts)(accountsData);
        return accountsData;
    }
    catch (error) {
        throw new Error(error);
    }
}
function loadConfig() {
    try {
        if (configCache) {
            return configCache;
        }
        const configDir = path_1.default.join(__dirname, '../', 'config.json');
        const config = fs_1.default.readFileSync(configDir, 'utf-8');
        const unverifiedConfig = JSON.parse(config);
        const configData = (0, Validator_1.validateConfig)(unverifiedConfig);
        configCache = configData;
        return configData;
    }
    catch (error) {
        throw new Error(error);
    }
}
async function loadSessionData(sessionPath, email, saveFingerprint, isMobile) {
    try {
        const cookiesFileName = isMobile ? 'session_mobile.json' : 'session_desktop.json';
        const cookieFile = path_1.default.join(__dirname, '../browser/', sessionPath, email, cookiesFileName);
        let cookies = [];
        if (fs_1.default.existsSync(cookieFile)) {
            const cookiesData = await fs_1.default.promises.readFile(cookieFile, 'utf-8');
            cookies = JSON.parse(cookiesData);
        }
        const fingerprintFileName = isMobile ? 'session_fingerprint_mobile.json' : 'session_fingerprint_desktop.json';
        const fingerprintFile = path_1.default.join(__dirname, '../browser/', sessionPath, email, fingerprintFileName);
        let fingerprint;
        const shouldLoadFingerprint = isMobile ? saveFingerprint.mobile : saveFingerprint.desktop;
        if (shouldLoadFingerprint && fs_1.default.existsSync(fingerprintFile)) {
            const fingerprintData = await fs_1.default.promises.readFile(fingerprintFile, 'utf-8');
            fingerprint = JSON.parse(fingerprintData);
        }
        return {
            cookies: cookies,
            fingerprint: fingerprint
        };
    }
    catch (error) {
        throw new Error(error);
    }
}
async function saveSessionData(sessionPath, cookies, email, isMobile) {
    try {
        const sessionDir = path_1.default.join(__dirname, '../browser/', sessionPath, email);
        const cookiesFileName = isMobile ? 'session_mobile.json' : 'session_desktop.json';
        if (!fs_1.default.existsSync(sessionDir)) {
            await fs_1.default.promises.mkdir(sessionDir, { recursive: true });
        }
        await fs_1.default.promises.writeFile(path_1.default.join(sessionDir, cookiesFileName), JSON.stringify(cookies));
        return sessionDir;
    }
    catch (error) {
        throw new Error(error);
    }
}
async function saveFingerprintData(sessionPath, email, isMobile, fingerpint) {
    try {
        const sessionDir = path_1.default.join(__dirname, '../browser/', sessionPath, email);
        const fingerprintFileName = isMobile ? 'session_fingerprint_mobile.json' : 'session_fingerprint_desktop.json';
        if (!fs_1.default.existsSync(sessionDir)) {
            await fs_1.default.promises.mkdir(sessionDir, { recursive: true });
        }
        await fs_1.default.promises.writeFile(path_1.default.join(sessionDir, fingerprintFileName), JSON.stringify(fingerpint));
        return sessionDir;
    }
    catch (error) {
        throw new Error(error);
    }
}
//# sourceMappingURL=Load.js.map