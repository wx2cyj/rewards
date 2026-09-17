import type { MicrosoftRewardsBot } from '../index';
export interface GiftCardItem {
    sku: string;
    title: string;
    points: number | null;
    shortfall: number | null;
    url: string;
    rawText: string;
    available: boolean;
    affordable: boolean;
    matchedKeywords: string[];
}
export interface GiftCardMonitorResult {
    checked: boolean;
    matches: GiftCardItem[];
    notified: GiftCardItem[];
    message: string;
}
export declare function parseGiftCardItems(html: string, keywords: string[], currentPoints: number): GiftCardItem[];
export declare function monitorGiftCards(bot: MicrosoftRewardsBot, accountEmail: string, currentPoints: number): Promise<GiftCardMonitorResult>;
//# sourceMappingURL=GiftCardMonitor.d.ts.map