import type { DashboardFailureDetails } from '../../../util/DashboardError';
import { Workers } from '../../Workers';
export type ClaimBonusOutcome = {
    status: 'verified';
    oldBalance: number;
    newBalance: number;
    gainedPoints: number;
    source: string;
} | {
    status: 'pending-verification';
    oldBalance: number;
    lastKnownPoints: number | null;
    source: string | null;
    verificationError: DashboardFailureDetails | null;
} | {
    status: 'skipped';
    oldBalance: number;
    reason: string;
};
export declare class ClaimBonusPoints extends Workers {
    private readonly oldBalance;
    claimBonusPoints(): Promise<ClaimBonusOutcome>;
    private executeClaimMutation;
    private finishVerified;
}
//# sourceMappingURL=ClaimBonusPoints.d.ts.map