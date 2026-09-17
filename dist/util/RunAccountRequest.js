"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRunAccountRequest = resolveRunAccountRequest;
exports.buildRunAccountEnvironment = buildRunAccountEnvironment;
const RunCheckpointStore_1 = require("./RunCheckpointStore");
function optionalRunAccountIndex(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed))
        throw new Error('运行账号序号必须是整数');
    return parsed;
}
function resolveRunAccountRequest(accountMode, indexValue, accountCount) {
    const requestedIndex = optionalRunAccountIndex(indexValue);
    const resolvedMode = accountMode === 'continue' && requestedIndex !== undefined ? 'account' : accountMode;
    const accountIndex = resolvedMode === 'account' ? requestedIndex : undefined;
    (0, RunCheckpointStore_1.validateRunAccountIndex)(accountCount, resolvedMode, accountIndex);
    return { accountMode: resolvedMode, accountIndex };
}
function buildRunAccountEnvironment(accountMode, accountIndex) {
    return {
        RUN_ACCOUNT_MODE: accountMode,
        ...(accountMode === 'account' && accountIndex !== undefined ? { RUN_ACCOUNT_INDEX: String(accountIndex) } : {})
    };
}
//# sourceMappingURL=RunAccountRequest.js.map