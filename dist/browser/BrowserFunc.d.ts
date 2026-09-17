import type { BrowserContext, Cookie, Page } from 'patchright';
import type { MicrosoftRewardsBot } from '../index';
import type { Counters, DashboardData, DashboardFieldAvailability } from './../interface/DashboardData';
import type { XboxDashboardData } from './../interface/XboxDashboardData';
import type { AppEarnablePoints, BrowserEarnablePoints, MissingSearchPoints } from '../interface/Points';
import type { AppDashboardData } from '../interface/AppDashBoardData';
import { PanelFlyoutData } from '../interface/PanelFlyoutData';
import { type DashboardFailureDetails } from '../util/DashboardError';
import { type ServerActionName, type ServerActionRuntimeInfo } from '../util/ServerActions';
export interface CurrentPointsSnapshot {
    points: number | null;
    source: string | null;
    confidence: 'confirmed' | 'cached' | 'unknown';
    observedAt: string | null;
    error: DashboardFailureDetails | null;
}
export default class BrowserFunc {
    private readonly verifiedSessionContexts;
    private bot;
    private dashboardCaptures;
    private lastDashboardFieldAvailability;
    private cachedPanelFlyoutData;
    private lastDashboardSource;
    private trustedPointsCache;
    private pointsCacheSequence;
    constructor(bot: MicrosoftRewardsBot);
    prepareDashboardCapture(page: Page, geoLocale?: string): void;
    /**
     * 获取用户桌面仪表板数据
     * @returns {DashboardData} 用户必应奖励仪表板数据对象
     */
    getDashboardData(geoLocale?: string): Promise<DashboardData>;
    private getDashboardResult;
    private getDashboardDataWithinBudget;
    resetCurrentPointsCache(): void;
    private isCurrentPointsSnapshot;
    markSessionVerified(context: BrowserContext): void;
    private confirmedPointsSnapshot;
    private currentPointsScope;
    private acceptDashboard;
    private rememberTrustedPoints;
    private dashboardRemainingMs;
    private dashboardRequestTimeout;
    private waitWithinDashboardBudget;
    private networkDashboardFailure;
    private safeDashboardDiagnostic;
    private shouldRetryDashboardApi;
    private dashboardOrigin;
    private panelFlyoutFallbackUrls;
    private dashboardRequestContext;
    private requestWithBrowserContext;
    private requestDashboardAxios;
    private fingerprintHeadersWithoutCookie;
    private captureDashboardResponse;
    private getCapturedDashboard;
    private getCapturedPoints;
    private logCapturedDashboard;
    private describeDashboardFailure;
    private logDashboardDiagnostic;
    private safePageUrl;
    private safePageTitle;
    /**
     * Fetch user panel flyout data
     * @returns {PanelFlyoutData} Object of user bing rewards dashboard data
     */
    getPanelFlyoutData(): Promise<PanelFlyoutData>;
    /**
     * 获取用户应用仪表板数据
     * @returns {AppDashboardData} 用户必应奖励仪表板数据对象
     */
    getAppDashboardData(): Promise<AppDashboardData>;
    /**
     * 获取用户xbox仪表板数据
     * @returns {XboxDashboardData} 用户必应奖励仪表板数据对象
     */
    getXBoxDashboardData(): Promise<XboxDashboardData>;
    /**
     * 获取搜索积分计数器
     */
    getSearchPoints(): Promise<Counters>;
    missingSearchPoints(counters: Counters, isMobile: boolean, availability?: DashboardFieldAvailability | undefined): MissingSearchPoints;
    getMobileSearchPointsFallback(isMobile: boolean): Promise<MissingSearchPoints | null>;
    getSearchPointsFallback(isMobile: boolean): Promise<MissingSearchPoints | null>;
    private getDashboardHtmlSearchPoints;
    private getPanelFlyoutSearchPoints;
    private findCounterContainer;
    /**
     * 获取通过网页浏览器可赚取的总积分
     */
    getBrowserEarnablePoints(dashboardData?: DashboardData): Promise<BrowserEarnablePoints>;
    /**
     * 获取通过移动应用可赚取的总积分
     */
    getAppEarnablePoints(): Promise<AppEarnablePoints>;
    /**
     * 获取当前积分金额
     * @returns {number} 当前总积分金额
     */
    getCurrentPoints(): Promise<number>;
    getCurrentPointsSnapshot(): Promise<CurrentPointsSnapshot>;
    /**
     * 从 dashboard 页面和静态脚本提取 Next.js Server Action 运行信息。
     * hash 与 dashboard 部署版本绑定，所以优先动态解析当前页面使用的 hash。
     */
    extractServerActionRuntimeInfo(page: Page, includeScripts?: boolean): Promise<ServerActionRuntimeInfo>;
    /**
     * 调用新版 dashboard 的 Next.js Server Action。
     * 认证靠 Cookie（无需 requestToken / accessToken），返回的响应是 RSC 流，只看 HTTP 状态码判断成功。
     *
     * @param actionName Server Action 名称
     * @param args Server Action 参数数组（如 [true] 开启连击保护；[] 无参数领积分）
     * @param tag 日志标签
     * @returns 成功返回 true，失败/降级返回 false
     */
    callServerAction(actionName: ServerActionName, args: unknown[], tag: string): Promise<boolean>;
    private clickVisibleClaimButton;
    private waitAndClickClaimButton;
    clickClaimBonusPointsButton(page: Page): Promise<boolean>;
    closeBrowser(browser: BrowserContext, email: string): Promise<void>;
    buildCookieHeaderForUrl(cookies: Cookie[], targetUrl: string): string;
}
//# sourceMappingURL=BrowserFunc.d.ts.map