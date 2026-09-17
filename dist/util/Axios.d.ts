import { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { AccountProxy } from '../interface/Account';
import type { DashboardFailureKind } from './DashboardError';
export interface SafeHttpDiagnostic {
    status: number | null;
    code: string | null;
    contentType: string | null;
    topLevelFields: string[];
    category: DashboardFailureKind;
    finalUrl: string | null;
    redirected: boolean | null;
}
export declare function safeHttpUrl(rawUrl: unknown): string | null;
export declare function axiosFinalUrl(value: unknown): string | null;
export declare function axiosRedirected(value: unknown, originalUrl: string): boolean | null;
export declare function responseContentType(headers: unknown): string | null;
export declare function responseTopLevelFields(data: unknown): string[];
export declare function classifyHttpFailure(status: number | null): DashboardFailureKind;
export declare function safeAxiosDiagnostic(error: unknown): SafeHttpDiagnostic;
declare class AxiosClient {
    private instance;
    private account;
    constructor(account: AccountProxy);
    private getAgentForProxy;
    request(config: AxiosRequestConfig, bypassProxy?: boolean): Promise<AxiosResponse>;
    requestOnce(config: AxiosRequestConfig, timeout?: number): Promise<AxiosResponse>;
}
export default AxiosClient;
//# sourceMappingURL=Axios.d.ts.map