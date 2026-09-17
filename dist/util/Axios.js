"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeHttpUrl = safeHttpUrl;
exports.axiosFinalUrl = axiosFinalUrl;
exports.axiosRedirected = axiosRedirected;
exports.responseContentType = responseContentType;
exports.responseTopLevelFields = responseTopLevelFields;
exports.classifyHttpFailure = classifyHttpFailure;
exports.safeAxiosDiagnostic = safeAxiosDiagnostic;
const axios_1 = __importDefault(require("axios"));
const axios_retry_1 = __importDefault(require("axios-retry"));
const http_proxy_agent_1 = require("http-proxy-agent");
const https_proxy_agent_1 = require("https-proxy-agent");
const socks_proxy_agent_1 = require("socks-proxy-agent");
const url_1 = require("url");
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function safeHttpUrl(rawUrl) {
    if (typeof rawUrl !== 'string')
        return null;
    try {
        const url = new url_1.URL(rawUrl);
        return `${url.origin}${url.pathname}`.slice(0, 300);
    }
    catch {
        return null;
    }
}
function axiosFinalUrl(value) {
    if (!isRecord(value))
        return null;
    const request = isRecord(value.request) ? value.request : null;
    const response = isRecord(value.response) ? value.response : null;
    const nestedRequest = response && isRecord(response.request) ? response.request : request;
    const nestedResponse = nestedRequest && isRecord(nestedRequest.res) ? nestedRequest.res : null;
    return safeHttpUrl(nestedRequest?.responseURL ?? nestedResponse?.responseUrl);
}
function axiosRedirected(value, originalUrl) {
    const finalUrl = axiosFinalUrl(value);
    const safeOriginal = safeHttpUrl(originalUrl);
    if (!finalUrl || !safeOriginal)
        return null;
    return finalUrl !== safeOriginal;
}
function responseContentType(headers) {
    if (!headers || typeof headers !== 'object')
        return null;
    const headerRecord = headers;
    const getter = headerRecord.get;
    const fromGetter = typeof getter === 'function' ? getter.call(headers, 'content-type') : undefined;
    const key = Object.keys(headerRecord).find(name => name.toLowerCase() === 'content-type');
    const value = fromGetter ?? (key ? headerRecord[key] : undefined);
    return typeof value === 'string' ? value.slice(0, 160) : null;
}
function responseTopLevelFields(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return [];
    const safeFields = Object.keys(data)
        .sort()
        .slice(0, 30)
        .map(field => /cookie|authorization|token|password|oauth|secret|verification|requestcode/i.test(field)
        ? '<redacted-field>'
        : field.slice(0, 80));
    return [...new Set(safeFields)];
}
function classifyHttpFailure(status) {
    if (status === 401 || status === 403)
        return 'auth';
    if (status === 404)
        return 'endpoint-unavailable';
    if (status === 429)
        return 'rate-limit';
    if (status !== null && status >= 500)
        return 'server';
    return status === null ? 'network' : 'invalid-response';
}
function safeAxiosDiagnostic(error) {
    if (!axios_1.default.isAxiosError(error)) {
        return {
            status: null,
            code: null,
            contentType: null,
            topLevelFields: [],
            category: 'network',
            finalUrl: null,
            redirected: null
        };
    }
    const status = error.response?.status ?? null;
    const originalUrl = typeof error.config?.url === 'string' ? error.config.url : '';
    return {
        status,
        code: typeof error.code === 'string' ? error.code.slice(0, 80) : null,
        contentType: responseContentType(error.response?.headers),
        topLevelFields: responseTopLevelFields(error.response?.data),
        category: classifyHttpFailure(status),
        finalUrl: axiosFinalUrl(error),
        redirected: originalUrl ? axiosRedirected(error, originalUrl) : null
    };
}
class AxiosClient {
    constructor(account) {
        this.account = account;
        this.instance = axios_1.default.create({
            timeout: 20000
        });
        if (this.account.url && this.account.proxyAxios) {
            const agent = this.getAgentForProxy(this.account);
            this.instance.defaults.httpAgent = agent;
            this.instance.defaults.httpsAgent = agent;
        }
        (0, axios_retry_1.default)(this.instance, {
            retries: 5,
            retryDelay: axios_retry_1.default.exponentialDelay,
            shouldResetTimeout: true,
            retryCondition: error => {
                if (axios_retry_1.default.isNetworkError(error))
                    return true;
                if (!error.response)
                    return true;
                const status = error.response.status;
                return status === 429 || (status >= 500 && status <= 599);
            }
        });
    }
    getAgentForProxy(proxyConfig) {
        const { url: baseUrl, port, username, password } = proxyConfig;
        let urlObj;
        try {
            urlObj = new url_1.URL(baseUrl);
        }
        catch {
            try {
                urlObj = new url_1.URL(`http://${baseUrl}`);
            }
            catch {
                throw new Error(`Invalid proxy URL format: ${baseUrl}`);
            }
        }
        const protocol = urlObj.protocol.toLowerCase();
        let proxyUrl;
        if (username && password) {
            urlObj.username = encodeURIComponent(username);
            urlObj.password = encodeURIComponent(password);
            urlObj.port = port.toString();
            proxyUrl = urlObj.toString();
        }
        else {
            proxyUrl = `${protocol}//${urlObj.hostname}:${port}`;
        }
        switch (protocol) {
            case 'http:':
                return new http_proxy_agent_1.HttpProxyAgent(proxyUrl);
            case 'https:':
                return new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
            case 'socks4:':
            case 'socks5:':
                return new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
            default:
                throw new Error(`Unsupported proxy protocol: ${protocol}. Only HTTP(S) and SOCKS4/5 are supported!`);
        }
    }
    async request(config, bypassProxy = false) {
        if (bypassProxy) {
            const bypassInstance = axios_1.default.create();
            (0, axios_retry_1.default)(bypassInstance, {
                retries: 3,
                retryDelay: axios_retry_1.default.exponentialDelay
            });
            return bypassInstance.request(config);
        }
        return this.instance.request(config);
    }
    async requestOnce(config, timeout = 15000) {
        return this.instance.request({
            ...config,
            timeout,
            'axios-retry': { retries: 0 }
        });
    }
}
exports.default = AxiosClient;
//# sourceMappingURL=Axios.js.map