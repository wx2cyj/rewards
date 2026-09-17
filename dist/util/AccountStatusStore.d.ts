export type AccountStatusState = 'unknown' | 'checking' | 'valid' | 'running' | 'success' | 'error';
export interface StoredAccountStatus {
    accountHash: string;
    state: AccountStatusState;
    stage: string;
    lastMessage: string;
    updatedAt: string;
    lastCheckedAt?: string;
    lastSuccessAt?: string;
    lastFailureAt?: string;
    error?: string;
}
interface StoredAccountStatusFile {
    version: 1;
    accounts: StoredAccountStatus[];
}
export declare function readAccountStatusFile(): StoredAccountStatusFile;
export declare function updateAccountStatus(email: string, patch: Partial<Omit<StoredAccountStatus, 'accountHash' | 'updatedAt'>>): void;
export {};
//# sourceMappingURL=AccountStatusStore.d.ts.map