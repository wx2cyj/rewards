import type { BasePromotion } from '../../../interface/DashboardData';
import { Workers } from '../../Workers';
export declare class Quiz extends Workers {
    private cookieHeader;
    private fingerprintHeader;
    private gainedPoints;
    private oldBalance;
    doQuiz(promotion: BasePromotion): Promise<void>;
}
//# sourceMappingURL=Quiz.d.ts.map