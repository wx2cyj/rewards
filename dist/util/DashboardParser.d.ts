import type { DashboardData } from '../interface/DashboardData';
export type DashboardDataSource = 'api' | 'legacy-html' | 'next-flight' | 'bing-flyout';
export interface DashboardParseResult {
    data: DashboardData | null;
    source: DashboardDataSource | null;
    reason: string;
    flightEntryCount?: number;
}
export interface DashboardValidationOptions {
    geoLocale?: string;
}
export interface AvailablePointsParseResult {
    points: number | null;
    reason: string;
}
export declare function validateDashboardData(value: unknown, options?: DashboardValidationOptions): {
    valid: true;
    data: DashboardData;
} | {
    valid: false;
    reason: string;
};
export declare function dashboardFromApiPayload(payload: unknown, options?: DashboardValidationOptions): DashboardParseResult;
export declare function availablePointsFromApiPayload(payload: unknown): AvailablePointsParseResult;
export declare function dashboardFromFlyoutPayload(payload: unknown, options?: DashboardValidationOptions): DashboardParseResult;
export declare function dashboardFromFlightEntries(entries: unknown, options?: DashboardValidationOptions): DashboardParseResult;
export declare function dashboardFromHtml(html: string, options?: DashboardValidationOptions): DashboardParseResult;
//# sourceMappingURL=DashboardParser.d.ts.map