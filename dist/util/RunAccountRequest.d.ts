import { type RunAccountMode } from './RunCheckpointStore';
export declare function resolveRunAccountRequest(accountMode: RunAccountMode, indexValue: unknown, accountCount: number): {
    accountMode: RunAccountMode;
    accountIndex?: number;
};
export declare function buildRunAccountEnvironment(accountMode: RunAccountMode, accountIndex?: number): Record<string, string>;
//# sourceMappingURL=RunAccountRequest.d.ts.map