export type ServerActionName = 'toggleStreakProtection' | 'claimBonusPoints';
export interface ServerActionRuntimeInfo {
    deploymentId: string | null;
    hashes: Partial<Record<ServerActionName, string>>;
    diagnostics: Partial<Record<ServerActionName, ServerActionHashDiagnostic>>;
    scriptUrls: string[];
}
export interface ServerActionHashDiagnostic {
    candidateCount: number;
    unique: boolean;
    reason: 'unique' | 'no-candidate' | 'ambiguous';
}
export declare const KNOWN_SERVER_ACTION_DEPLOYMENT_IDS: Set<string>;
export declare const FALLBACK_SERVER_ACTION_HASHES: Record<ServerActionName, string>;
export declare function isKnownServerActionDeployment(deploymentId: string | null | undefined): boolean;
export interface ServerActionSource {
    name: string;
    content: string;
}
export declare function extractDeploymentIdFromHtml(html: string): string | null;
export declare function extractScriptUrls(html: string, baseUrl?: string): string[];
export declare function extractServerActionHashesFromSources(sources: ServerActionSource[]): Partial<Record<ServerActionName, string>>;
export declare function extractServerActionHashResultFromSources(sources: ServerActionSource[]): {
    hashes: Partial<Record<ServerActionName, string>>;
    diagnostics: Partial<Record<ServerActionName, ServerActionHashDiagnostic>>;
};
//# sourceMappingURL=ServerActions.d.ts.map