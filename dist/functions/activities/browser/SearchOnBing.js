"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchOnBing = void 0;
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const Workers_1 = require("../../Workers");
const QueryEngine_1 = require("../../QueryEngine");
class SearchOnBing extends Workers_1.Workers {
    constructor() {
        super(...arguments);
        this.bingHome = 'https://bing.com';
        this.reportActivityUrl = 'https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest';
        this.cookieHeader = '';
        this.fingerprintHeader = {};
        this.gainedPoints = 0;
        this.success = false;
        this.oldBalance = this.bot.userData.currentPoints;
    }
    async doSearchOnBing(promotion, page) {
        const offerId = promotion.offerId;
        this.oldBalance = Number(this.bot.userData.currentPoints ?? 0);
        this.bot.logger.info(this.bot.isMobile, 'SEARCH-ON-BING', `开始必应搜索 | offerId=${offerId} | 标题="${promotion.title}" | 当前积分=${this.oldBalance}`);
        try {
            this.cookieHeader = this.bot.browser.func.buildCookieHeaderForUrl(this.bot.isMobile ? this.bot.cookies.mobile : this.bot.cookies.desktop, this.reportActivityUrl);
            const fingerprintHeaders = { ...this.bot.fingerprint.headers };
            delete fingerprintHeaders['Cookie'];
            delete fingerprintHeaders['cookie'];
            this.fingerprintHeader = fingerprintHeaders;
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING', `为必应搜索准备的头部信息 | offerId=${offerId} | cookie长度=${this.cookieHeader.length} | 指纹头键数=${Object.keys(this.fingerprintHeader).length}`);
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING', `激活搜索任务 | offerId=${offerId}`);
            const activated = await this.activateSearchTask(promotion);
            if (!activated) {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-ON-BING', `搜索活动无法激活，正在中止 | offerId=${offerId}`);
                return;
            }
            // 在这里进行必应搜索
            const queries = await this.getSearchQueries(promotion);
            // 执行查询
            await this.searchBing(page, queries);
            if (this.success) {
                this.bot.logger.info(this.bot.isMobile, 'SEARCH-ON-BING', `完成必应搜索 | offerId=${offerId} | 起始余额=${this.oldBalance} | 最终余额=${this.bot.userData.currentPoints}`);
            }
            else {
                this.bot.logger.warn(this.bot.isMobile, 'SEARCH-ON-BING', `必应搜索失败 | offerId=${offerId} | 起始余额=${this.oldBalance} | 最终余额=${this.bot.userData.currentPoints}`);
            }
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'SEARCH-ON-BING', `doSearchOnBing中出现错误 | offerId=${promotion.offerId} | 消息=${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async searchBing(page, queries) {
        queries = [...new Set(queries)];
        this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `开始搜索循环 | 查询数量=${queries.length} | 旧余额=${this.oldBalance}`);
        let i = 0;
        for (const query of queries) {
            try {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `处理查询 | 查询="${query}"`);
                const cvid = (0, crypto_1.randomBytes)(16).toString('hex');
                const url = `${this.bingHome}/search?q=${encodeURIComponent(query)}&PC=U531&FORM=ANNTA1&cvid=${cvid}`;
                await this.bot.mainMobilePage.goto(url);
                // 等待页面加载完成
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
                await this.bot.browser.utils.tryDismissAllMessages(page);
                const searchBar = '#sb_form_q';
                const searchBox = page.locator(searchBar);
                await searchBox.waitFor({ state: 'attached', timeout: 15000 });
                await this.bot.utils.wait(500);
                await this.bot.browser.utils.ghostClick(page, searchBar, { clickCount: 3 });
                await searchBox.fill('');
                await page.keyboard.type(query, { delay: 50 });
                await page.keyboard.press('Enter');
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 7000));
                // 检查积分更新
                const newBalance = await this.bot.browser.func.getCurrentPoints();
                this.gainedPoints = newBalance - this.oldBalance;
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `查询后余额检查 | 查询="${query}" | 旧余额=${this.oldBalance} | 新余额=${newBalance} | 获得积分=${this.gainedPoints}`);
                if (this.gainedPoints > 0) {
                    this.bot.recordPointGain('必应搜索活动', this.gainedPoints, newBalance);
                    this.bot.logger.info(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `必应搜索查询完成 | 查询="${query}" | 获得积分=${this.gainedPoints} | 旧余额=${this.oldBalance} | 新余额=${newBalance}`, 'green');
                    this.success = true;
                    return;
                }
                else {
                    this.bot.logger.warn(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `${++i}/${queries.length} | 无积分=1 | 查询="${query}"`);
                }
            }
            catch (error) {
                this.bot.logger.error(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `搜索循环期间出错 | 查询="${query}" | 消息=${error instanceof Error ? error.message : String(error)}`);
            }
            finally {
                await this.bot.utils.wait(this.bot.utils.randomDelay(5000, 15000));
                await page.goto(this.bot.config.baseURL, { timeout: 5000 }).catch(() => { });
            }
        }
        this.bot.logger.warn(this.bot.isMobile, 'SEARCH-ON-BING-SEARCH', `完成所有查询但未获得积分 | 尝试查询数=${queries.length} | 旧余额=${this.oldBalance} | 最终余额=${this.bot.userData.currentPoints}`);
    }
    // 任务需要在能够完成之前被激活
    async activateSearchTask(promotion) {
        try {
            this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-ACTIVATE', `准备激活请求 | offerId=${promotion.offerId} | 哈希=${promotion.hash}`);
            const formData = new URLSearchParams({
                id: promotion.offerId,
                hash: promotion.hash,
                timeZone: this.bot.userData.timezoneOffset,
                activityAmount: '1',
                dbs: '0',
                form: '',
                type: '',
                __RequestVerificationToken: this.bot.requestToken
            });
            const request = {
                url: this.reportActivityUrl,
                method: 'POST',
                headers: {
                    ...this.fingerprintHeader,
                    Cookie: this.cookieHeader,
                    Referer: 'https://rewards.bing.com/',
                    Origin: 'https://rewards.bing.com'
                },
                data: formData
            };
            const response = await this.bot.axios.request(request);
            this.bot.logger.info(this.bot.isMobile, 'SEARCH-ON-BING-ACTIVATE', `成功激活活动 | 状态=${response.status} | offerId=${promotion.offerId}`);
            return true;
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'SEARCH-ON-BING-ACTIVATE', `激活失败 | offerId=${promotion.offerId} | 消息=${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    async getSearchQueries(promotion) {
        let queries = [];
        try {
            if (this.bot.config.searchOnBingLocalQueries) {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', '使用本地查询配置文件');
                const data = fs.readFileSync(path_1.default.join(__dirname, '../../bing-search-activity-queries.json'), 'utf8');
                queries = JSON.parse(data);
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', `已加载查询配置 | 来源=本地 | 条目数=${queries.length}`);
            }
            else {
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', '从远程仓库获取查询配置');
                // 直接从仓库获取，这样用户不需要重新下载脚本来获取新活动
                const response = await this.bot.axios.request({
                    method: 'GET',
                    url: 'https://raw.githubusercontent.com/TheNetsky/Microsoft-Rewards-Script/refs/heads/v3/src/functions/bing-search-activity-queries.json'
                });
                queries = response.data;
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', `已加载查询配置 | 来源=远程 | 条目数=${queries.length}`);
            }
            const answers = queries.find(x => this.bot.utils.normalizeString(x.title) === this.bot.utils.normalizeString(promotion.title));
            if (answers && answers.queries.length > 0) {
                const answer = this.bot.utils.shuffleArray(answers.queries);
                this.bot.logger.info(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', `找到活动标题的答案 | 来源=${this.bot.config.searchOnBingLocalQueries ? 'local' : 'remote'} | 标题="${promotion.title}" | 答案数量=${answer.length} | 第一个查询="${answer[0]}"`);
                return answer;
            }
            else {
                this.bot.logger.info(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', `查询配置中没有匹配的标题 | 来源=${this.bot.config.searchOnBingLocalQueries ? 'local' : 'remote'} | 标题="${promotion.title}"`);
                const queryCore = new QueryEngine_1.QueryCore(this.bot);
                const promotionDescription = promotion.description.toLowerCase().trim();
                const queryDescription = promotionDescription.replace('search on bing', '').trim();
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', `请求必应建议 | 查询描述="${queryDescription}"`);
                const bingSuggestions = await queryCore.getBingSuggestions(queryDescription);
                this.bot.logger.debug(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', `必应建议结果 | 数量=${bingSuggestions.length} | 标题="${promotion.title}"`);
                // 如果未找到建议
                if (!bingSuggestions.length) {
                    this.bot.logger.info(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', `未找到建议，回退到活动标题 | 标题="${promotion.title}"`);
                    return [promotion.title];
                }
                else {
                    this.bot.logger.info(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', `使用必应建议作为搜索查询 | 数量=${bingSuggestions.length} | 标题="${promotion.title}"`);
                    return bingSuggestions;
                }
            }
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'SEARCH-ON-BING-QUERY', `解析搜索查询时出错 | 标题="${promotion.title}" | 消息=${error instanceof Error ? error.message : String(error)} | 回退=活动标题`);
            return [promotion.title];
        }
    }
}
exports.SearchOnBing = SearchOnBing;
//# sourceMappingURL=SearchOnBing.js.map