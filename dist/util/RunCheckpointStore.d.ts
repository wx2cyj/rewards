export type RunAccountMode = 'continue' | 'failed' | 'all' | 'account';
export type RunCheckpointState = 'pending' | 'running' | 'completed' | 'failed' | 'interrupted' | 'skipped';
export interface StoredRunCheckpointAccount {
    accountHash: string;
    state: RunCheckpointState;
    currentTask: string;
    currentStep: string;
    lastMessage: string;
    updatedAt: string;
    startedAt?: string;
    finishedAt?: string;
    runSource?: string;
    runMode?: RunAccountMode;
    pid?: number;
    error?: string;
}
interface StoredRunCheckpointFile {
    version: 1;
    date: string;
    updatedAt: string;
    accounts: StoredRunCheckpointAccount[];
}
export interface RunCheckpointSelection<T> {
    mode: RunAccountMode;
    targetAccountIndex?: number;
    selected: T[];
    skipped: T[];
    interrupted: number;
}
export declare function readRunCheckpointFile(): StoredRunCheckpointFile;
export declare function selectAccountsForRun<T extends {
    email: string;
}>(accounts: T[], options: {
    mode: RunAccountMode;
    targetAccountIndex?: number;
    runSource?: string;
    pid?: number;
}): RunCheckpointSelection<T>;
export declare function selectAccountsWithoutCheckpoint<T extends {
    email: string;
}>(accounts: T[], options: {
    mode: RunAccountMode;
    targetAccountIndex?: number;
}): RunCheckpointSelection<T>;
export declare function validateRunAccountIndex(accountCount: number, mode: RunAccountMode, targetAccountIndex?: number): void;
export declare function syncRunCheckpointFromAccountCheck(email: string, result: {
    hasPendingTasks: boolean;
    message: string;
    runSource?: string;
    pid?: number;
}): void;
export declare function updateRunCheckpoint(email: string, patch: Partial<Omit<StoredRunCheckpointAccount, 'accountHash' | 'updatedAt'>>): void;
export declare function markRunningCheckpointsInterrupted(message: string): void;
export {};
//# sourceMappingURL=RunCheckpointStore.d.ts.map