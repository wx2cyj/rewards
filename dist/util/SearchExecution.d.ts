import type { Page } from 'patchright';
export type SearchOperationStage = 'search-box' | 'submit' | 'post-submit-wait' | 'scroll' | 'click' | 'search-delay' | 'dashboard-refresh';
export interface SearchTimeoutBudget {
    navigationMs: number;
    retryDelayMs: number;
    stageTimeouts: Record<SearchOperationStage, number>;
    queryTimeoutMs: number;
}
export interface SearchBudgetOptions {
    searchDelayMax: string | number;
    searchResultVisitTime: string | number;
    interactionTimeout?: string | number;
    scrollRandomResults: boolean;
    clickRandomResults: boolean;
}
export declare function calculateSearchTimeoutBudget(options: SearchBudgetOptions): SearchTimeoutBudget;
export declare function calculateSearchRoundTimeoutMs(queryTimeoutMs: number, remainingPoints: number, queryCount: number): number;
export declare class SearchOperationError extends Error {
    readonly operationStage: SearchOperationStage;
    readonly timeoutMs: number;
    readonly elapsedMs: number;
    readonly timedOut: boolean;
    readonly cause?: unknown;
    constructor(operationStage: SearchOperationStage, message: string, timeoutMs: number, elapsedMs: number, timedOut: boolean, options?: {
        cause?: unknown;
    });
}
export declare function abortableWait(delayMs: number, signal: AbortSignal): Promise<void>;
export declare function runSearchStage<T>(options: {
    page: Pick<Page, 'close' | 'isClosed'>;
    controller: AbortController;
    stage: SearchOperationStage;
    timeoutMs: number;
    operation: (signal: AbortSignal) => Promise<T>;
}): Promise<T>;
export declare const SEARCH_PRE_SUBMIT_ATTEMPTS = 3;
//# sourceMappingURL=SearchExecution.d.ts.map