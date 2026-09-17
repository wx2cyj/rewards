"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardFetchError = void 0;
exports.dashboardFailureDetails = dashboardFailureDetails;
exports.isDashboardFetchError = isDashboardFetchError;
class DashboardFetchError extends Error {
    constructor(options) {
        super(`dashboard 获取失败：API ${options.apiReason}；页面回退 ${options.fallbackReason}`);
        this.stage = 'dashboard';
        this.name = 'DashboardFetchError';
        this.apiStatus = options.apiStatus ?? null;
        this.apiReason = options.apiReason;
        this.fallbackReason = options.fallbackReason;
        this.apiFailureKind = options.apiFailureKind;
        this.attempts = Math.max(0, Math.trunc(options.attempts ?? 0));
        this.elapsedMs = Math.max(0, Math.trunc(options.elapsedMs ?? 0));
    }
    toJSON() {
        return dashboardFailureDetails(this);
    }
}
exports.DashboardFetchError = DashboardFetchError;
function dashboardFailureDetails(error) {
    if (error instanceof DashboardFetchError) {
        return {
            stage: error.stage,
            message: error.message,
            apiStatus: error.apiStatus,
            apiReason: error.apiReason,
            fallbackReason: error.fallbackReason,
            apiFailureKind: error.apiFailureKind,
            attempts: error.attempts,
            elapsedMs: error.elapsedMs
        };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
        stage: 'dashboard',
        message,
        apiStatus: null,
        apiReason: '未确认',
        fallbackReason: message,
        apiFailureKind: 'invalid-response',
        attempts: 0,
        elapsedMs: 0
    };
}
function isDashboardFetchError(error) {
    return error instanceof DashboardFetchError;
}
//# sourceMappingURL=DashboardError.js.map