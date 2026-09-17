"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountSchema = exports.ConfigSchema = void 0;
exports.validateConfig = validateConfig;
exports.validateAccounts = validateAccounts;
exports.checkNodeVersion = checkNodeVersion;
const zod_1 = require("zod");
const semver_1 = __importDefault(require("semver"));
const package_json_1 = __importDefault(require("../../package.json"));
const NumberOrString = zod_1.z.union([zod_1.z.number(), zod_1.z.string()]);
const LogFilterSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    mode: zod_1.z.enum(['whitelist', 'blacklist']),
    levels: zod_1.z.array(zod_1.z.enum(['debug', 'info', 'warn', 'error'])).optional(),
    keywords: zod_1.z.array(zod_1.z.string()).optional(),
    regexPatterns: zod_1.z.array(zod_1.z.string()).optional()
});
const DelaySchema = zod_1.z.object({
    min: NumberOrString,
    max: NumberOrString
});
const QueryEngineSchema = zod_1.z.enum(['china', 'google', 'wikipedia', 'reddit', 'local']);
const GiftCardMonitorSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().optional(),
    keywords: zod_1.z.array(zod_1.z.string()),
    requireEnoughPoints: zod_1.z.boolean().optional(),
    notifyOnce: zod_1.z.boolean().optional(),
    shopUrl: zod_1.z.string().optional()
});
// Webhook
const WebhookSchema = zod_1.z.object({
    discord: zod_1.z
        .object({
        enabled: zod_1.z.boolean(),
        url: zod_1.z.string()
    })
        .optional(),
    ntfy: zod_1.z
        .object({
        enabled: zod_1.z.boolean().optional(),
        url: zod_1.z.string(),
        topic: zod_1.z.string().optional(),
        token: zod_1.z.string().optional(),
        title: zod_1.z.string().optional(),
        tags: zod_1.z.array(zod_1.z.string()).optional(),
        priority: zod_1.z.union([zod_1.z.literal(1), zod_1.z.literal(2), zod_1.z.literal(3), zod_1.z.literal(4), zod_1.z.literal(5)]).optional()
    })
        .optional(),
    pushplus: zod_1.z
        .object({
        enabled: zod_1.z.boolean().optional(),
        token: zod_1.z.string(),
        title: zod_1.z.string().optional(),
        template: zod_1.z.enum(['txt', 'html', 'markdown']).optional(),
        channel: zod_1.z.string().optional()
    })
        .optional(),
    wecom: zod_1.z
        .object({
        enabled: zod_1.z.boolean().optional(),
        corpId: zod_1.z.string(),
        agentId: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
        corpSecret: zod_1.z.string(),
        toUser: zod_1.z.string(),
        proxyMode: zod_1.z.enum(['direct', 'qinglong']).optional(),
        proxyBaseUrl: zod_1.z.string().optional()
    })
        .optional(),
    webhookLogFilter: LogFilterSchema
});
// Config
exports.ConfigSchema = zod_1.z.object({
    baseURL: zod_1.z.string(),
    sessionPath: zod_1.z.string(),
    headless: zod_1.z.boolean(),
    clusters: zod_1.z.number().int().nonnegative(),
    errorDiagnostics: zod_1.z.boolean(),
    ensureStreakProtection: zod_1.z.boolean(),
    workers: zod_1.z.object({
        doDailySet: zod_1.z.boolean(),
        doSpecialPromotions: zod_1.z.boolean(),
        doMorePromotions: zod_1.z.boolean(),
        doClaimBonusPoints: zod_1.z.boolean(),
        doPunchCards: zod_1.z.boolean(),
        doAppPromotions: zod_1.z.boolean(),
        doDesktopSearch: zod_1.z.boolean(),
        doMobileSearch: zod_1.z.boolean(),
        doDailyCheckIn: zod_1.z.boolean(),
        doReadToEarn: zod_1.z.boolean()
    }),
    searchOnBingLocalQueries: zod_1.z.boolean(),
    globalTimeout: NumberOrString,
    searchSettings: zod_1.z.object({
        scrollRandomResults: zod_1.z.boolean(),
        clickRandomResults: zod_1.z.boolean(),
        parallelSearching: zod_1.z.boolean(),
        queryEngines: zod_1.z.array(QueryEngineSchema),
        searchResultVisitTime: NumberOrString,
        searchDelay: DelaySchema,
        readDelay: DelaySchema,
        chinaApi: zod_1.z
            .object({
            appkey: zod_1.z.string().optional()
        })
            .optional()
    }),
    debugLogs: zod_1.z.boolean(),
    proxy: zod_1.z.object({
        queryEngine: zod_1.z.boolean()
    }),
    giftCardMonitor: GiftCardMonitorSchema,
    consoleLogFilter: LogFilterSchema,
    webhook: WebhookSchema
});
// Account
exports.AccountSchema = zod_1.z.object({
    email: zod_1.z.string(),
    password: zod_1.z.string(),
    totpSecret: zod_1.z.string().optional(),
    recoveryEmail: zod_1.z.string(),
    geoLocale: zod_1.z.string(),
    langCode: zod_1.z.string(),
    proxy: zod_1.z.object({
        proxyAxios: zod_1.z.boolean(),
        url: zod_1.z.string(),
        port: zod_1.z.number(),
        password: zod_1.z.string(),
        username: zod_1.z.string()
    }),
    saveFingerprint: zod_1.z.object({
        mobile: zod_1.z.boolean(),
        desktop: zod_1.z.boolean()
    })
});
const defaultConfig = {
    baseURL: 'https://rewards.bing.com',
    sessionPath: 'sessions',
    headless: true,
    clusters: 1,
    errorDiagnostics: true,
    ensureStreakProtection: true,
    workers: {
        doDailySet: true,
        doSpecialPromotions: true,
        doMorePromotions: true,
        doClaimBonusPoints: true,
        doPunchCards: true,
        doAppPromotions: true,
        doDesktopSearch: true,
        doMobileSearch: true,
        doDailyCheckIn: true,
        doReadToEarn: true
    },
    searchOnBingLocalQueries: false,
    globalTimeout: '30sec',
    searchSettings: {
        scrollRandomResults: true,
        clickRandomResults: true,
        parallelSearching: true,
        queryEngines: ['google', 'wikipedia', 'reddit', 'local'],
        searchResultVisitTime: '10sec',
        searchDelay: { min: '30sec', max: '1min' },
        readDelay: { min: '30sec', max: '1min' },
        chinaApi: { appkey: '' }
    },
    debugLogs: false,
    proxy: { queryEngine: true },
    giftCardMonitor: {
        enabled: false,
        keywords: [],
        requireEnoughPoints: false,
        notifyOnce: true,
        shopUrl: 'https://rewards.bing.com/redeem/cn?section=shop'
    },
    consoleLogFilter: {
        enabled: false,
        mode: 'whitelist',
        levels: ['info', 'warn', 'error'],
        keywords: [],
        regexPatterns: []
    },
    webhook: {
        wecom: {
            enabled: false,
            corpId: '',
            agentId: '',
            corpSecret: '',
            toUser: '',
            proxyMode: 'direct',
            proxyBaseUrl: ''
        },
        webhookLogFilter: {
            enabled: false,
            mode: 'whitelist',
            levels: ['warn', 'error'],
            keywords: [],
            regexPatterns: []
        }
    }
};
function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function getByPath(obj, path) {
    return path.reduce((acc, key) => {
        if (acc == null)
            return undefined;
        return acc[key];
    }, obj);
}
function setByPath(obj, path, value) {
    if (path.length === 0)
        return value;
    const head = path[0];
    if (head === undefined)
        return value;
    const rest = path.slice(1);
    const base = obj ?? (typeof head === 'number' ? [] : {});
    const cloned = Array.isArray(base) ? [...base] : { ...base };
    cloned[head] = setByPath(base[head], rest, value);
    return cloned;
}
function fillMissing(data, defaults, path = '') {
    if (!isPlainObject(defaults))
        return data;
    if (!isPlainObject(data)) {
        if (data === undefined) {
            console.warn(`[Config] "${path || '<root>'}" 缺失，使用默认值`);
            return defaults;
        }
        return data;
    }
    const result = { ...data };
    for (const key of Object.keys(defaults)) {
        const p = path ? `${path}.${key}` : key;
        if (!(key in result)) {
            console.warn(`[Config] "${p}" 未找到，使用默认值: ${JSON.stringify(defaults[key])}`);
            result[key] = defaults[key];
        }
        else if (isPlainObject(defaults[key])) {
            result[key] = fillMissing(result[key], defaults[key], p);
        }
    }
    return result;
}
function validateConfig(data) {
    const filled = fillMissing(data, defaultConfig);
    let result = exports.ConfigSchema.safeParse(filled);
    if (result.success)
        return result.data;
    let patched = filled;
    for (const issue of result.error.issues) {
        const def = getByPath(defaultConfig, issue.path);
        console.warn(`[Config] "${issue.path.join('.') || '<root>'}" 无效 (${issue.message})，使用默认值: ${JSON.stringify(def)}`);
        patched = setByPath(patched, issue.path, def);
    }
    result = exports.ConfigSchema.safeParse(patched);
    if (!result.success) {
        console.error('[Config] 应用默认值后仍然无效:', result.error.issues);
        throw new Error('配置校验失败');
    }
    return result.data;
}
function validateAccounts(data) {
    const result = zod_1.z.array(exports.AccountSchema).safeParse(data);
    if (result.success)
        return result.data;
    for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '<root>';
        if (issue.code === 'invalid_type') {
            if (issue.input === undefined) {
                console.error(`[Accounts] "${path}" 缺失 (期望 ${issue.expected})`);
            }
            else {
                console.error(`[Accounts] "${path}" 类型错误: 期望 ${issue.expected}，实际 ${typeof issue.input}`);
            }
        }
        else if (issue.code === 'invalid_union') {
            console.error(`[Accounts] "${path}" 不匹配任何允许的类型: ${issue.message}`);
        }
        else {
            console.error(`[Accounts] "${path}" ${issue.message} (代码: ${issue.code})`);
        }
    }
    throw new Error(`账户校验失败: ${result.error.issues.length} 个问题 — 请查看上方日志`);
}
function checkNodeVersion() {
    try {
        const requiredVersion = package_json_1.default.engines?.node;
        if (!requiredVersion) {
            console.warn('在package.json "engines" 字段中未找到Node.js版本要求。');
            return;
        }
        if (!semver_1.default.satisfies(process.version, requiredVersion)) {
            console.error(`当前Node.js版本 ${process.version} 不满足要求: ${requiredVersion}`);
            process.exit(1);
        }
    }
    catch (error) {
        console.error('验证Node.js版本失败:', error);
        process.exit(1);
    }
}
//# sourceMappingURL=Validator.js.map