import type { MicrosoftRewardsBot } from '../index';
import type { Page } from 'patchright';
import { type ClaimBonusOutcome } from './activities/api/ClaimBonusPoints';
import type { BasePromotion, DashboardData, FindClippyPromotion, PurplePromotionalItem } from '../interface/DashboardData';
import type { MissingSearchPoints } from '../interface/Points';
import type { Promotion } from '../interface/AppDashBoardData';
export default class Activities {
    private bot;
    constructor(bot: MicrosoftRewardsBot);
    doSearch: (data: DashboardData, page: Page, isMobile: boolean, initialMissingPoints?: MissingSearchPoints) => Promise<number>;
    doSearchOnBing: (promotion: BasePromotion, page: Page) => Promise<void>;
    doUrlReward: (promotion: BasePromotion) => Promise<void>;
    doDaily: (promotion: BasePromotion) => Promise<void>;
    doQuiz: (promotion: BasePromotion) => Promise<void>;
    doFindClippy: (promotion: FindClippyPromotion) => Promise<void>;
    doDoubleSearchPoints: (promotion: PurplePromotionalItem) => Promise<void>;
    doClaimBonusPoints: () => Promise<ClaimBonusOutcome>;
    doStreakProtection: () => Promise<void>;
    doAppReward: (promotion: Promotion) => Promise<void>;
    doReadToEarn: () => Promise<void>;
    doDailyCheckIn: () => Promise<void>;
}
//# sourceMappingURL=Activities.d.ts.map