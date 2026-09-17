import type { BasePromotion } from '../../../interface/DashboardData';
import { Workers } from '../../Workers';
export declare class UrlRewardNew extends Workers {
    private cookieHeader;
    private fingerprintHeader;
    private gainedPoints;
    private oldBalance;
    private panelData;
    doUrlReward(promotion: BasePromotion): Promise<void>;
}
//# sourceMappingURL=UrlRewardNew.d.ts.map