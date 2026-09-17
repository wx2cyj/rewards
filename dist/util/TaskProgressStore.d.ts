export interface StoredTaskProgressItem {
    completed: number;
    total: number;
    gained: number;
    status: string;
}
export interface StoredTaskProgressDetail extends StoredTaskProgressItem {
    key: string;
    label: string;
    group: ProgressTaskKey | 'activity';
    message: string;
    updatedAt: string;
}
export interface StoredAccountTaskProgress {
    accountHash: string;
    updatedAt: string;
    initialPoints: number;
    currentPoints: number;
    finalPoints: number;
    currentTask: string;
    currentStage: string;
    currentMessage: string;
    desktop: StoredTaskProgressItem;
    mobile: StoredTaskProgressItem;
    daily: StoredTaskProgressItem;
    details: StoredTaskProgressDetail[];
}
interface StoredTaskProgressFile {
    date: string;
    accounts: StoredAccountTaskProgress[];
}
export type ProgressTaskKey = 'desktop' | 'mobile' | 'daily';
export declare function accountProgressHash(email: string): string;
export declare function taskDetailKey(label: string): string;
export declare function readTaskProgressFile(): StoredTaskProgressFile;
export declare function updateTaskProgress(email: string, task: ProgressTaskKey, patch: Partial<StoredTaskProgressItem>): void;
export declare function updateAccountTaskProgress(email: string, patch: Partial<Record<ProgressTaskKey, Partial<StoredTaskProgressItem>>>): void;
export declare function updateAccountPointTotals(email: string, patch: Partial<Pick<StoredAccountTaskProgress, 'initialPoints' | 'currentPoints' | 'finalPoints'>>): void;
export declare function resetAccountRunProgress(email: string, points: Partial<Pick<StoredAccountTaskProgress, 'initialPoints' | 'currentPoints' | 'finalPoints'>>): void;
export declare function updateAccountRunState(email: string, patch: Partial<Pick<StoredAccountTaskProgress, 'currentTask' | 'currentStage' | 'currentMessage'>>): void;
export declare function updateAccountRunFailure(email: string, stage: string, message: string): void;
export declare function updateTaskDetail(email: string, detail: Pick<StoredTaskProgressDetail, 'key' | 'label' | 'group'> & Partial<StoredTaskProgressDetail>): void;
export declare function recordTaskDetailGain(email: string, detail: Pick<StoredTaskProgressDetail, 'key' | 'label' | 'group'>, gained: number, message?: string): void;
export declare function updateSearchTaskProgress(email: string, task: Extract<ProgressTaskKey, 'desktop' | 'mobile'>, gained: number, remaining: number, fallbackTotal: number): void;
export declare function updateSearchTaskFailure(email: string, task: Extract<ProgressTaskKey, 'desktop' | 'mobile'>, patch: {
    completed?: number;
    total?: number;
    message: string;
}): StoredTaskProgressItem;
export {};
//# sourceMappingURL=TaskProgressStore.d.ts.map