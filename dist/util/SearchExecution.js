"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEARCH_PRE_SUBMIT_ATTEMPTS = exports.SearchOperationError = void 0;
exports.calculateSearchTimeoutBudget = calculateSearchTimeoutBudget;
exports.calculateSearchRoundTimeoutMs = calculateSearchRoundTimeoutMs;
exports.abortableWait = abortableWait;
exports.runSearchStage = runSearchStage;
const ms_1 = __importDefault(require("ms"));
const SEARCH_BOX_TIMEOUT_MS = 16000;
const SUBMIT_TIMEOUT_MS = 20000;
const POST_SUBMIT_TIMEOUT_MS = 5000;
const SCROLL_TIMEOUT_MS = 10000;
const DASHBOARD_REFRESH_TIMEOUT_MS = 60000;
const NAVIGATION_TIMEOUT_MS = 25000;
const RETRY_DELAY_MS = 2000;
const SAFETY_MARGIN_MS = 10000;
const CLICK_SAFETY_MARGIN_MS = 5000;
const DEFAULT_INTERACTION_TIMEOUT_MS = 30000;
const PRE_SUBMIT_ATTEMPTS = 3;
const MIN_ROUND_TIMEOUT_MS = 10 * 60000;
const MAX_ROUND_TIMEOUT_MS = 60 * 60000;
function durationMs(value) {
    const parsed = typeof value === 'number' ? value : (0, ms_1.default)(value);
    if (parsed === undefined || !Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`无效搜索延迟配置: ${String(value)}`);
    }
    return parsed;
}
function calculateSearchTimeoutBudget(options) {
    const searchDelayMs = durationMs(options.searchDelayMax) + 2000;
    const interactionTimeoutMs = options.interactionTimeout === undefined
        ? DEFAULT_INTERACTION_TIMEOUT_MS
        : durationMs(options.interactionTimeout);
    const clickMs = options.clickRandomResults
        ? durationMs(options.searchResultVisitTime) + interactionTimeoutMs + CLICK_SAFETY_MARGIN_MS
        : 0;
    const scrollMs = options.scrollRandomResults ? SCROLL_TIMEOUT_MS : 0;
    const stageTimeouts = {
        'search-box': SEARCH_BOX_TIMEOUT_MS,
        submit: SUBMIT_TIMEOUT_MS,
        'post-submit-wait': POST_SUBMIT_TIMEOUT_MS,
        scroll: scrollMs,
        click: clickMs,
        'search-delay': searchDelayMs,
        'dashboard-refresh': DASHBOARD_REFRESH_TIMEOUT_MS
    };
    const retryAllowanceMs = (PRE_SUBMIT_ATTEMPTS - 1) * RETRY_DELAY_MS;
    const queryTimeoutMs = NAVIGATION_TIMEOUT_MS +
        PRE_SUBMIT_ATTEMPTS * (SEARCH_BOX_TIMEOUT_MS + SUBMIT_TIMEOUT_MS) +
        retryAllowanceMs +
        POST_SUBMIT_TIMEOUT_MS +
        scrollMs +
        clickMs +
        searchDelayMs +
        DASHBOARD_REFRESH_TIMEOUT_MS +
        SAFETY_MARGIN_MS;
    return {
        navigationMs: NAVIGATION_TIMEOUT_MS,
        retryDelayMs: RETRY_DELAY_MS,
        stageTimeouts,
        queryTimeoutMs
    };
}
function calculateSearchRoundTimeoutMs(queryTimeoutMs, remainingPoints, queryCount) {
    const plannedQueries = Math.max(1, Math.min(Math.max(1, Math.ceil(remainingPoints)), Math.max(1, queryCount)));
    return Math.min(MAX_ROUND_TIMEOUT_MS, Math.max(MIN_ROUND_TIMEOUT_MS, queryTimeoutMs * plannedQueries));
}
class SearchOperationError extends Error {
    constructor(operationStage, message, timeoutMs, elapsedMs, timedOut, options) {
        super(message);
        this.operationStage = operationStage;
        this.timeoutMs = timeoutMs;
        this.elapsedMs = elapsedMs;
        this.timedOut = timedOut;
        this.name = 'SearchOperationError';
        this.cause = options?.cause;
    }
}
exports.SearchOperationError = SearchOperationError;
function abortableWait(delayMs, signal) {
    if (signal.aborted)
        return Promise.reject(signal.reason ?? new Error('搜索操作已终止'));
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, Math.max(0, delayMs));
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal.reason ?? new Error('搜索操作已终止'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
async function runSearchStage(options) {
    const { page, controller, stage } = options;
    const timeoutMs = Math.max(1, Math.floor(options.timeoutMs));
    const startedAt = Date.now();
    let timer;
    let timedOut = false;
    let timeoutError;
    const operationPromise = Promise.resolve().then(() => options.operation(controller.signal));
    const timeoutPromise = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            timedOut = true;
            const elapsedMs = Date.now() - startedAt;
            timeoutError = new SearchOperationError(stage, `搜索阶段超时 | stage=${stage} | timeoutMs=${timeoutMs}`, timeoutMs, elapsedMs, true);
            controller.abort(timeoutError);
            void (async () => {
                if (!page.isClosed())
                    await page.close({ runBeforeUnload: false }).catch(() => { });
                reject(timeoutError);
            })();
        }, timeoutMs);
    });
    try {
        return await Promise.race([operationPromise, timeoutPromise]);
    }
    catch (error) {
        if (timedOut && timeoutError) {
            await operationPromise.catch(() => undefined);
            throw timeoutError;
        }
        if (error instanceof SearchOperationError)
            throw error;
        throw new SearchOperationError(stage, `搜索阶段失败 | stage=${stage} | message=${error instanceof Error ? error.message : String(error)}`, timeoutMs, Date.now() - startedAt, false, { cause: error });
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
exports.SEARCH_PRE_SUBMIT_ATTEMPTS = PRE_SUBMIT_ATTEMPTS;
//# sourceMappingURL=SearchExecution.js.map