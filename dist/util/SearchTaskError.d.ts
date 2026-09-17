export type SearchTaskKind = 'mobile' | 'desktop';
export type SearchFailureStage = 'mobile-search' | 'desktop-login' | 'desktop-search' | 'dashboard-search-counter';
export type SearchOperationStage = import('./SearchExecution').SearchOperationStage;
export declare class SearchTaskError extends Error {
    readonly stage: SearchFailureStage;
    readonly task: SearchTaskKind;
    readonly completed: number;
    readonly total: number;
    readonly loginState?: string | undefined;
    readonly operationStage?: SearchOperationStage | undefined;
    constructor(stage: SearchFailureStage, task: SearchTaskKind, message: string, completed: number, total: number, loginState?: string | undefined, operationStage?: SearchOperationStage | undefined);
}
export declare function toSearchTaskError(error: unknown, stage: SearchFailureStage, task: SearchTaskKind, completed: number, total: number): SearchTaskError;
//# sourceMappingURL=SearchTaskError.d.ts.map