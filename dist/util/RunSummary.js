"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardAccountFailure = dashboardAccountFailure;
exports.genericAccountFailure = genericAccountFailure;
exports.calculateKnownPointTotals = calculateKnownPointTotals;
exports.resolveRunExitCode = resolveRunExitCode;
exports.formatAccountPoints = formatAccountPoints;
exports.formatAccountError = formatAccountError;
exports.buildWeComAccountMessage = buildWeComAccountMessage;
function dashboardAccountFailure(error) {
    return {
        stage: error.stage,
        message: error.message,
        apiStatus: error.apiStatus,
        fallbackReason: error.fallbackReason
    };
}
function genericAccountFailure(stage, message) {
    return { stage, message, apiStatus: null, fallbackReason: null };
}
function calculateKnownPointTotals(stats) {
    let initialPoints = 0;
    let finalPoints = 0;
    let collectedPoints = 0;
    let knownAccounts = 0;
    for (const stat of stats) {
        if (stat.initialPoints === null || stat.finalPoints === null || stat.collectedPoints === null)
            continue;
        knownAccounts += 1;
        initialPoints += stat.initialPoints;
        finalPoints += stat.finalPoints;
        collectedPoints += stat.collectedPoints;
    }
    return {
        initialPoints,
        finalPoints,
        collectedPoints,
        knownAccounts,
        unknownAccounts: stats.length - knownAccounts
    };
}
function resolveRunExitCode(stats, workerFailure = false) {
    return workerFailure || stats.some(stat => !stat.success) ? 1 : 0;
}
function formatAccountPoints(stat) {
    const dashboardUnknown = stat.initialPoints === null && stat.error?.stage === 'dashboard';
    const initial = stat.initialPoints === null ? (dashboardUnknown ? '未知（dashboard 获取失败）' : '未知') : String(stat.initialPoints);
    const final = stat.finalPoints === null ? '未知' : String(stat.finalPoints);
    const collected = stat.collectedPoints === null ? '未计算' : String(stat.collectedPoints);
    const compactCollected = stat.collectedPoints === null ? '未计算' : `+${stat.collectedPoints}`;
    return { initial, final, collected, compact: `${compactCollected} | ${initial}→${final}` };
}
function formatAccountError(error) {
    if (!error)
        return null;
    if (error.stage === 'dashboard' && !error.message.startsWith('dashboard 获取失败：')) {
        return `dashboard 获取失败：${error.message}`;
    }
    return error.message;
}
function buildWeComAccountMessage(stat, timestamp, duration) {
    const status = stat.success ? '完成' : '失败';
    const points = formatAccountPoints(stat);
    const lines = [
        `Microsoft Rewards 账号任务${status}`,
        `时间：${timestamp}`,
        `账号：${stat.email}`,
        `任务前总积分：${points.initial}`,
        `任务后总积分：${points.final}`,
        `本次总增加：${points.collected}`,
        `耗时：${duration}`
    ];
    if (stat.taskSummary.length > 0) {
        lines.push('', '任务明细：');
        for (const task of stat.taskSummary) {
            const progress = task.total !== undefined && task.completed !== undefined ? ` | 进度 ${task.completed}/${task.total}` : '';
            lines.push(`- ${task.label}：+${task.gained} 分${progress} | ${task.status}`);
        }
    }
    const errorText = formatAccountError(stat.error);
    if (errorText)
        lines.push('', `错误：${errorText}`);
    return lines.join('\n');
}
//# sourceMappingURL=RunSummary.js.map