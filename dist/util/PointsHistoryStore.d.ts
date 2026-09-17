export type PointCategoryKey = 'pcSearch' | 'mobileSearch' | 'dailyActivity' | 'appActivity' | 'checkIn' | 'readToEarn' | 'bonus' | 'streak' | 'other';
export type PointRunStatus = 'completed' | 'partial' | 'failed' | 'skipped' | 'notRun';
export type PointsRangePreset = 'week' | 'month' | 'quarter' | 'year' | 'custom';
export type PointCategoryTotals = Record<PointCategoryKey, number>;
export interface PointTaskSummaryLike {
    label: string;
    key?: string;
    gained: number;
    status?: string;
}
export interface PointRunRecord {
    id: string;
    date: string;
    accountHash: string;
    accountLabel: string;
    source: string;
    pid: number;
    startedAt: string;
    finishedAt: string;
    beforePoints: number;
    afterPoints: number;
    runGained: number;
    todayGained: number;
    categories: PointCategoryTotals;
    status: PointRunStatus;
    taskSummary: PointTaskSummaryLike[];
    balanceUnconfirmed?: boolean;
    failureStage?: string;
    error?: string;
}
export interface PointFailureRecord {
    id: string;
    date: string;
    accountHash: string;
    accountLabel: string;
    source: string;
    pid: number;
    failedAt: string;
    stage: string;
    error: string;
}
export interface PointDayRecord {
    date: string;
    accountHash: string;
    accountLabel: string;
    beforePoints: number;
    afterPoints: number;
    todayGained: number;
    runGained: number;
    categories: PointCategoryTotals;
    status: PointRunStatus;
    updatedAt: string;
    runs: PointRunRecord[];
}
export interface PointsHistoryFile {
    version: 1;
    updatedAt: string;
    days: PointDayRecord[];
    failures: PointFailureRecord[];
}
export interface PointsCalendarAccount {
    id: string;
    accountHash: string;
    label: string;
}
export interface PointsCalendarRecord {
    accountId: string;
    accountLabel: string;
    date: string;
    beforePoints: number;
    afterPoints: number;
    todayGained: number;
    runGained: number;
    categories: PointCategoryTotals;
    status: PointRunStatus;
    updatedAt: string;
    runs: Array<Omit<PointRunRecord, 'accountHash'>>;
}
export interface PointsCalendarDay {
    date: string;
    totalGained: number;
    categories: PointCategoryTotals;
    status: PointRunStatus;
    records: number;
}
export interface PointsCalendarSummary {
    totalPoints: number;
    averageDailyPoints: number;
    completedDays: number;
    failedDays: number;
    highestPointDay: {
        date: string;
        points: number;
    };
}
export interface PointsCalendarResponse {
    accounts: Array<{
        id: string;
        label: string;
    }>;
    range: {
        preset: PointsRangePreset;
        start: string;
        end: string;
    };
    summary: PointsCalendarSummary;
    days: PointsCalendarDay[];
    records: PointsCalendarRecord[];
}
export declare function pointCategoryFor(label: string, task?: 'daily' | 'mobile' | 'desktop', detailLabel?: string): PointCategoryKey;
export declare function readPointsHistoryFile(): PointsHistoryFile;
export declare function recordPointFailure(email: string, failure: {
    stage: string;
    error: string;
    source?: string;
    pid?: number;
}): string;
export declare function startPointRun(email: string, beforePoints: number, options?: {
    source?: string;
    pid?: number;
}): string;
export declare function updatePointRunBaseline(email: string, runId: string | null, beforePoints: number): void;
export declare function recordPointRunGain(email: string, runId: string | null, label: string, category: PointCategoryKey, gained: number, balance?: number): void;
export declare function ensurePointRunCategoryMinimum(email: string, runId: string | null, label: string, category: PointCategoryKey, minimumGained: number, balance?: number): void;
export declare function finishPointRun(email: string, runId: string | null, patch: {
    status: PointRunStatus;
    beforePoints?: number;
    afterPoints?: number;
    runGained?: number;
    taskSummary?: PointTaskSummaryLike[];
    balanceUnconfirmed?: boolean;
    failureStage?: string;
    error?: string;
}): void;
export declare function queryPointsCalendar(accounts: PointsCalendarAccount[], options?: {
    account?: string;
    range?: string;
    start?: string;
    end?: string;
    now?: Date;
}): PointsCalendarResponse;
//# sourceMappingURL=PointsHistoryStore.d.ts.map