import { AsyncLocalStorage } from 'node:async_hooks';
import type { Cookie, Page } from 'patchright';
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator';
import BrowserFunc from './browser/BrowserFunc';
import BrowserUtils from './browser/BrowserUtils';
import { Logger } from './logging/Logger';
import Utils from './util/Utils';
import Activities from './functions/Activities';
import type { Account } from './interface/Account';
import AxiosClient from './util/Axios';
import { PanelFlyoutData } from './interface/PanelFlyoutData';
import type { ServerActionName } from './util/ServerActions';
import { type AccountTaskSummary } from './util/RunSummary';
interface ExecutionContext {
    isMobile: boolean;
    account: Account;
}
declare const executionContext: AsyncLocalStorage<ExecutionContext>;
export declare function getCurrentContext(): ExecutionContext;
interface UserData {
    userName: string;
    accountEmail: string;
    geoLocale: string;
    langCode: string;
    timezoneOffset: string;
    initialPoints: number;
    currentPoints: number;
    gainedPoints: number;
}
export declare class MicrosoftRewardsBot {
    logger: Logger;
    config: import("./interface/Config").Config;
    utils: Utils;
    activities: Activities;
    browser: {
        func: BrowserFunc;
        utils: BrowserUtils;
    };
    mainMobilePage: Page;
    mainDesktopPage: Page;
    userData: UserData;
    panelData: PanelFlyoutData;
    rewardsVersion: 'legacy' | 'modern';
    accessToken: string;
    requestToken: string;
    cookies: {
        mobile: Cookie[];
        desktop: Cookie[];
    };
    fingerprint: BrowserFingerprintWithHeaders;
    currentDetailTask: {
        key: string;
        label: string;
        group: 'daily' | 'mobile' | 'desktop' | 'activity';
    } | null;
    private currentPointRunId;
    private dashboardPointsKnown;
    serverActions: {
        deploymentId: string | null;
        hashes: Partial<Record<ServerActionName, string>>;
    };
    private pointsCanCollect;
    private activeWorkers;
    private exitedWorkers;
    private browserFactory;
    private accounts;
    private workers;
    private login;
    private searchManager;
    axios: AxiosClient;
    constructor();
    private formatDurationSeconds;
    private buildSummaryMessage;
    private buildWeComAccountMessage;
    private sendWeComAccountSummary;
    private sendPushPlusSummary;
    get isMobile(): boolean;
    recordPointGain(label: string, gained: number, newBalance: number, task?: 'daily' | 'mobile' | 'desktop'): void;
    private updateFormalRunCheckpoint;
    private syncAccountCheckRunCheckpoint;
    private runGiftCardMonitor;
    private safeStartPointRun;
    private safeEnsurePointRunCategoryMinimum;
    private finishCurrentPointRun;
    initialize(): Promise<void>;
    run(): Promise<void>;
    private runMaster;
    private runWorker;
    private runTasks;
    Main(account: Account): Promise<{
        initialPoints: number;
        finalPoints: number | null;
        collectedPoints: number | null;
        taskSummary: AccountTaskSummary[];
        partial?: boolean;
        partialReason?: string;
        balanceUnconfirmed?: boolean;
    }>;
}
export { executionContext };
//# sourceMappingURL=index.d.ts.map