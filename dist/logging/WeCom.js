"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWeCom = sendWeCom;
exports.testWeCom = testWeCom;
exports.diagnoseWeCom = diagnoseWeCom;
exports.flushWeComQueue = flushWeComQueue;
const axios_1 = __importDefault(require("axios"));
const p_queue_1 = __importDefault(require("p-queue"));
const DEFAULT_WECOM_BASE_URL = 'https://qyapi.weixin.qq.com';
const WECOM_TEXT_LIMIT = 2000;
const tokenCache = new Map();
const wecomQueue = new p_queue_1.default({
    interval: 1000,
    intervalCap: 2,
    carryoverConcurrencyCount: true
});
function baseUrl(config) {
    const configured = config.proxyMode === 'qinglong' ? config.proxyBaseUrl?.trim() : '';
    return (configured || DEFAULT_WECOM_BASE_URL).replace(/\/+$/, '');
}
function truncateText(content) {
    return content.length <= WECOM_TEXT_LIMIT ? content : `${content.slice(0, WECOM_TEXT_LIMIT - 16)} ...(已截断)`;
}
function cacheKey(config) {
    return `${baseUrl(config)}|${config.corpId}`;
}
function sanitizeMessage(message) {
    return message
        .replace(/(access_token=)[^&\s]+/gi, '$1[REDACTED]')
        .replace(/\b(corpsecret|corp_secret|secret|token)(\s*[:=]\s*)([^\s|]+)/gi, '$1$2[REDACTED]');
}
function assertConfigured(config) {
    if (!config.corpId?.trim())
        throw new Error('企业微信 corpid 未配置');
    if (!String(config.agentId ?? '').trim())
        throw new Error('企业微信 agentid 未配置');
    if (!Number.isInteger(Number(config.agentId)))
        throw new Error('企业微信 agentid 必须是数字');
    if (!config.corpSecret?.trim())
        throw new Error('企业微信 corpsecret 未配置');
    if (!config.toUser?.trim())
        throw new Error('企业微信 touser 未配置');
}
async function getAccessToken(config) {
    assertConfigured(config);
    const key = cacheKey(config);
    const cached = tokenCache.get(key);
    if (cached && cached.expiresAt > Date.now() + 60000) {
        return cached.accessToken;
    }
    const request = {
        method: 'GET',
        url: `${baseUrl(config)}/cgi-bin/gettoken`,
        params: {
            corpid: config.corpId,
            corpsecret: config.corpSecret
        },
        timeout: 10000
    };
    const response = await (0, axios_1.default)(request);
    const data = response.data;
    if (data.errcode && data.errcode !== 0) {
        throw new Error(`获取企业微信 access_token 失败：${data.errcode} ${sanitizeMessage(data.errmsg ?? '')}`);
    }
    if (!data.access_token) {
        throw new Error('获取企业微信 access_token 失败：响应缺少 access_token');
    }
    tokenCache.set(key, {
        accessToken: data.access_token,
        expiresAt: Date.now() + Math.max(60, Number(data.expires_in ?? 7200) - 300) * 1000
    });
    return data.access_token;
}
async function sendTextNow(config, content) {
    const accessToken = await getAccessToken(config);
    const request = {
        method: 'POST',
        url: `${baseUrl(config)}/cgi-bin/message/send`,
        params: { access_token: accessToken },
        headers: { 'Content-Type': 'application/json' },
        data: {
            touser: config.toUser,
            msgtype: 'text',
            agentid: Number(config.agentId),
            text: { content: truncateText(content) },
            safe: 0
        },
        timeout: 10000
    };
    const response = await (0, axios_1.default)(request);
    const data = response.data;
    if (data.errcode && data.errcode !== 0) {
        throw new Error(`企业微信发送失败：${data.errcode} ${sanitizeMessage(data.errmsg ?? '')}`);
    }
}
async function sendWeCom(config, content) {
    if (!config?.enabled)
        return;
    await wecomQueue.add(async () => {
        try {
            await sendTextNow(config, content);
        }
        catch (error) {
            console.warn(`[WeCom] ${sanitizeMessage(error instanceof Error ? error.message : String(error))}`);
        }
    });
}
async function testWeCom(config) {
    await sendTextNow(config, `Microsoft Rewards Script 企业微信测试推送\n时间：${new Date().toLocaleString()}`);
}
async function diagnoseWeCom(config) {
    const url = new URL('/cgi-bin/gettoken', baseUrl(config));
    const response = await axios_1.default.get(url.toString(), {
        timeout: 8000,
        validateStatus: () => true
    });
    return {
        ok: response.status > 0 && response.status < 500,
        message: `企业微信 API 地址可访问，HTTP ${response.status}`
    };
}
async function flushWeComQueue(timeoutMs = 5000) {
    await Promise.race([
        (async () => {
            await wecomQueue.onIdle();
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('企业微信刷新超时')), timeoutMs))
    ]).catch(() => { });
}
//# sourceMappingURL=WeCom.js.map