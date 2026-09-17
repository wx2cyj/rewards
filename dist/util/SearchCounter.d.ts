import type { Counters, DashboardFieldAvailability } from '../interface/DashboardData';
import type { MissingSearchPoints, SearchCounterInfo, SearchCounterSource } from '../interface/Points';
export declare function analyzeSearchCounter(rawItems: unknown, label: string, source?: SearchCounterSource, index?: number): SearchCounterInfo;
export declare function calculateMissingSearchPoints(counters: Partial<Counters> | Record<string, unknown> | null | undefined, isMobile: boolean, source?: SearchCounterSource, availability?: Pick<DashboardFieldAvailability, 'mobileSearch' | 'pcSearch'>): MissingSearchPoints;
//# sourceMappingURL=SearchCounter.d.ts.map