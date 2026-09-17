import type { MicrosoftRewardsBot } from '../index';
import { QueryEngine } from '../interface/Config';
export declare class QueryCore {
    private bot;
    constructor(bot: MicrosoftRewardsBot);
    queryManager(options?: {
        shuffle?: boolean;
        sourceOrder?: QueryEngine[];
        related?: boolean;
        langCode?: string;
        geoLocale?: string;
    }): Promise<string[]>;
    private buildRelatedClusters;
    /**
     * 输出热搜词使用清单，分三类展示：
     * - 可扩展（有建议/相关词）
     * - 未扩展（Bing 无建议/相关，直接作为搜索词）
     * - 直通（超过 LIMIT 没参与扩展）
     * 每类最多展示 20 个，避免日志过长。
     */
    private logTopicUsageReport;
    private normalizeAndDedupe;
    getGoogleTrends(geoLocale: string): Promise<string[]>;
    private extractJsonFromResponse;
    getBingSuggestions(query?: string, langCode?: string): Promise<string[]>;
    getBingRelatedTerms(query: string): Promise<string[]>;
    getBingTrendingTopics(langCode?: string): Promise<string[]>;
    getWikipediaTrending(langCode?: string): Promise<string[]>;
    getRedditTopics(subreddit?: string): Promise<string[]>;
    getLocalQueryList(): string[];
    /**
     * 获取中国地区的热门搜索词（百度、抖音、微博、头条、知乎等）。
     * 数据源：gmya.net 热门词 API。
     * 策略：
     *   - appkey 配置在 searchSettings.chinaApi.appkey；留空走免费档。
     *   - 随机选取若干源聚合结果，分散 API 负载、增加搜索词多样性。
     *   - 免费档（无 appkey）有激进的频率限制：源与源之间插入随机退避，
     *     命中限流（403）后对后续源做指数退避；有 appkey 则不退避。
     *   - 某个源失败时自动 fallback 到剩余源，确保至少拿到 1 个源的数据。
     *
     * @param geoLocale - 地理区域代码，默认为'CN'
     * @returns 热搜标题字符串数组
     */
    getChinaTrends(geoLocale?: string): Promise<string[]>;
    /**
     * 构造 gmya.net 热搜 API 的请求 URL。
     */
    private buildChinaApiUrl;
    /**
     * 请求单个中国热搜源并解析标题。
     * 走 bot.axios（统一代理、错误诊断、fingerprint headers），带 10s 超时。
     *
     * 诊断策略：正常就 return；异常只把响应摘要写入日志，避免压缩/二进制响应污染日志页。
     * 唯一例外是限流：上层退避需要它做控制流，所以用 ChinaApiRateLimitError 单独标记，
     * 错误信息同样带上安全摘要。
     */
    private fetchChinaHotWords;
    /**
     * 判断响应是否为 gmya.net 免费档限流。
     * 免费档限流响应：{ code: "403", msg: "您请求过于频繁，未使用账号appkey请求将限制请求频率" }
     * 没有 data 数组，需和真正的格式异常区分，否则会误导排查方向。
     */
    private isChinaRateLimited;
    /**
     * 把响应体序列化为可读、安全的短字符串，诊断失败时用。
     * - 对象走 JSON.stringify
     * - 字符串会过滤不可打印字符
     * - undefined/空记为 <无响应体>
     * 兜底截断到 500 字符，防止上游误返回超大 HTML 或压缩二进制污染日志。
     */
    private summarizeBody;
    private safeLogSnippet;
    /**
     * 描述 axios 抛出的错误，返回可读文本 + 是否为限流。
     * - 有 response：吐原始响应体（限流标记由 HTTP 状态码 403/429 判定）
     * - 无 response（超时/断网/DNS）：吐 axios 错误码 + message
     */
    private describeAxiosError;
}
//# sourceMappingURL=QueryEngine.d.ts.map