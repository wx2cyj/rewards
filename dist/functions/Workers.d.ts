import type { Page } from 'patchright';
import type { MicrosoftRewardsBot } from '../index';
import type { DashboardData } from '../interface/DashboardData';
import type { AppDashboardData } from '../interface/AppDashBoardData';
import type { ClaimBonusOutcome } from './activities/api/ClaimBonusPoints';
export declare class Workers {
    bot: MicrosoftRewardsBot;
    constructor(bot: MicrosoftRewardsBot);
    doDailySet(data: DashboardData, page: Page): Promise<void>;
    doMorePromotions(data: DashboardData, page: Page): Promise<void>;
    doAppPromotions(data: AppDashboardData): Promise<void>;
    doSpecialPromotions(data: DashboardData): Promise<void>;
    doClaimBonusPoints(data: DashboardData): Promise<ClaimBonusOutcome>;
    doPunchCards(data: DashboardData, page: Page): Promise<void>;
    doDesktopAppPromotions(): Promise<void>;
    doQuestPunchCards(): Promise<void>;
    private solveActivities;
}
