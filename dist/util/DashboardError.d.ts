export type DashboardFailureKind = 'network' | 'auth' | 'rate-limit' | 'server' | 'endpoint-unavailable' | 'invalid-response';
export interface DashboardFailureDetails {
    stage: 'dashboard';
    message: string;
    apiStatus: number | null;
    apiReason: string;
    fallbackReason: string;
    apiFailureKind: DashboardFailureKind;
    attempts: number;
    elapsedMs: number;
}
export declare class DashboardFetchError extends Error implements DashboardFailureDetails {
    readonly stage: "dashboard";
    readonly apiStatus: number | null;
    readonly apiReason: string;
    readonly fallbackReason: string;
    readonly apiFailureKind: DashboardFailureKind;
    readonly attempts: number;
    readonly elapsedMs: number;
    constructor(options: {
        apiStatus?: number | null;
        apiReason: string;
        fallbackReason: string;
        apiFailureKind: DashboardFailureKind;
        attempts?: number;
        elapsedMs?: number;
    });
    toJSON(): DashboardFailureDetails;
}
export declare function dashboardFailureDetails(error: unknown): DashboardFailureDetails;
export declare function isDashboardFetchError(error: unknown): error is DashboardFetchError;
//# sourceMappingURL=DashboardError.d.ts.map