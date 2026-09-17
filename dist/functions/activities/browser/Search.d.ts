import type { Page } from 'patchright';
import type { DashboardData } from '../../../interface/DashboardData';
import type { MissingSearchPoints } from '../../../interface/Points';
import { Workers } from '../../Workers';
/**
 * 必应搜索类，负责执行必应搜索以获取积分
 * 该类继承自Workers，提供了搜索相关的核心功能
 */
export declare class Search extends Workers {
    /** 必应主页URL */
    private bingHome;
    /** 当前搜索页面URL */
    private searchPageURL;
    /** 搜索计数器 */
    private searchCount;
    /** 首次滚动标志 */
    private firstScroll;
    private counterUnavailable;
    private counterStatus;
    doSearch(data: DashboardData, page: Page, isMobile: boolean, initialMissingPoints?: MissingSearchPoints): Promise<number>;
    private bingSearch;
    private executeStage;
    private performBingSearch;
    private randomScroll;
    private clickRandomLink;
}
//# sourceMappingURL=Search.d.ts.map