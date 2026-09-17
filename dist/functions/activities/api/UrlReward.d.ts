import type { BasePromotion } from '../../../interface/DashboardData';
import { Workers } from '../../Workers';
export declare class UrlReward extends Workers {
    private cookieHeader;
    private fingerprintHeader;
    private gainedPoints;
    private oldBalance;
    doUrlReward(promotion: BasePromotion): Promise<void>;
}
//# sourceMappingURL=UrlReward.d.ts.map