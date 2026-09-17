"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchTaskError = void 0;
exports.toSearchTaskError = toSearchTaskError;
class SearchTaskError extends Error {
    constructor(stage, task, message, completed, total, loginState, operationStage) {
        super(message);
        this.stage = stage;
        this.task = task;
        this.completed = completed;
        this.total = total;
        this.loginState = loginState;
        this.operationStage = operationStage;
        this.name = 'SearchTaskError';
    }
}
exports.SearchTaskError = SearchTaskError;
function toSearchTaskError(error, stage, task, completed, total) {
    if (error instanceof SearchTaskError)
        return error;
    const source = error instanceof Error ? error : null;
    const sourceMessage = source?.message ?? String(error);
    const loginState = typeof source?.loginState === 'string' ? source.loginState : undefined;
    const operationStage = typeof source?.operationStage === 'string' ? source.operationStage : undefined;
    const diagnostic = [loginState ? `登录状态 ${loginState}` : '', operationStage ? `操作阶段 ${operationStage}` : '']
        .filter(Boolean)
        .join('，');
    return new SearchTaskError(stage, task, `搜索任务失败（阶段 ${stage}${diagnostic ? `，${diagnostic}` : ''}）：${sourceMessage}`, Math.max(0, completed), Math.max(0, total), loginState, operationStage);
}
//# sourceMappingURL=SearchTaskError.js.map