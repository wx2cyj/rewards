import type { BrowserContext } from 'patchright';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import { MicrosoftRewardsBot } from '../index';
import type { DashboardData } from '../interface/DashboardData';
import type { Account } from '../interface/Account';
import type { MissingSearchPoints } from '../interface/Points';
interface BrowserSession {
    context: BrowserContext;
    fingerprint: BrowserFingerprintWithHeaders;
}
interface SearchResults {
    mobilePoints: number;
    desktopPoints: number;
}
export declare class SearchManager {
    private bot;
    constructor(bot: MicrosoftRewardsBot);
    private readCurrentPoints;
    private searchCounterProgress;
    private progressFromCounter;
    private isCounterUnrecognized;
    private desktopRemaining;
    private desktopTotal;
    private throwSearchFailure;
    private mobileSkipStatus;
    private mobileSkipReason;
    private searchUiStatus;
    private searchUiMessage;
    doSearches(data: DashboardData, missingSearchPoints: MissingSearchPoints, mobileSession: BrowserSession, account: Account, accountEmail: string): Promise<SearchResults>;
    private doParallelSearches;
    private doSequentialSearches;
    private createDesktopSession;
    private doMobileSearch;
    private doDesktopSearch;
    private doDesktopSearchSequential;
}
export {};
//# sourceMappingURL=SearchManager.d.ts.map