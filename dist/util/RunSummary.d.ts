import type { DashboardFailureDetails } from './DashboardError';
export interface AccountTaskSummary {
    key: 'daily' | 'mobile' | 'desktop' | 'other';
    label: string;
    completed?: number;
    total?: number;
    gained: number;
    status: string;
}
export interface AccountFailureDetails {
    stage: string;
    message: string;
    apiStatus: number | null;
    fallbackReason: string | null;
}
export interface AccountStats {
    email: string;
    initialPoints: number | null;
    finalPoints: number | null;
    collectedPoints: number | null;
    taskSummary: AccountTaskSummary[];
    duration: number;
    success: boolean;
    error?: AccountFailureDetails;
}
export interface KnownPointTotals {
    initialPoints: number;
    finalPoints: number;
    collectedPoints: number;
    knownAccounts: number;
    unknownAccounts: number;
}
export declare function dashboardAccountFailure(error: DashboardFailureDetails): AccountFailureDetails;
export declare function genericAccountFailure(stage: string, message: string): AccountFailureDetails;
export declare function calculateKnownPointTotals(stats: AccountStats[]): KnownPointTotals;
export declare function resolveRunExitCode(stats: AccountStats[], workerFailure?: boolean): 0 | 1;
export declare function formatAccountPoints(stat: AccountStats): {
    initial: string;
    final: string;
    collected: string;
    compact: string;
};
export declare function formatAccountError(error: AccountFailureDetails | undefined): string | null;
export declare function buildWeComAccountMessage(stat: AccountStats, timestamp: string, duration: string): string;
//# sourceMappingURL=RunSummary.d.ts.map