"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Search = void 0;
const crypto_1 = require("crypto");
const QueryEngine_1 = require("../../QueryEngine");
const Workers_1 = require("../../Workers");
const TaskProgressStore_1 = require("../../../util/TaskProgressStore");
const SearchExecution_1 = require("../../../util/SearchExecution");
/**
 * 必应搜索类，负责执行必应搜索以获取积分
 * 该类继承自Workers，提供了搜索相关的核心功能
 */
class Search extends Workers_1.Workers {
    constructor() {
        super(...arguments);
        /** 必应主页URL */
        this.bingHome = 'https://bing.com';
        /** 当前搜索页面URL */
        this.searchPageURL = '';
        /** 搜索计数器 */
        this.searchCount = 0;
        /** 首次滚动标志 */
        this.firstScroll = true;
    }
    counterUnavailable(points, isMobile) {
        const status = isMobile ? points.mobileStatus : points.desktopCounter.status;
        return ['missing-counter', 'empty-counter', 'invalid-counter'].includes(status);
    }
    counterStatus(points, isMobile) {
        return isMobile ? points.mobileStatus : points.desktopCounter.status;
    }
    async doSearch(data, page, isMobile, initialMissingPoints) {
        const startBalance = Number(this.bot.userData.currentPoints ?? 0);
        const accountEmail = this.bot.userData.accountEmail;
        const taskKey = isMobile ? 'mobile' : 'desktop';
        this.bot.logger.info(isMobile, 'SEARCH-BING', `开始必应搜索 | currentPoints=${startBalance}`);
        let totalGainedPoints = 0;
        let missingPointsTotal = 0;
        let initialMissingPointsTotal = 0;
        let latestMissingPointsTotal = 0;
        const roundStartedAt = Date.now();
        try {
            let searchCounters = await this.bot.browser.func.getSearchPoints().catch(() => null);
            const missingPoints = initialMissingPoints ?? (searchCounters ? this.bot.browser.func.missingSearchPoints(searchCounters, isMobile) : null);
            if (!missingPoints) {
                this.bot.logger.warn(isMobile, 'SEARCH-BING', '无法获取搜索初始计数器，安全退出');
                return 0;
            }
            missingPointsTotal = missingPoints.totalPoints;
            initialMissingPointsTotal = missingPointsTotal;
            latestMissingPointsTotal = missingPointsTotal;
            if (!initialMissingPoints && this.counterUnavailable(missingPoints, isMobile)) {
                const device = isMobile ? '移动' : 'PC';
                throw new Error(`${device}搜索额度未确认 | reason=${this.counterStatus(missingPoints, isMobile)} | source=${missingPoints.source}`);
            }
            this.bot.logger.debug(isMobile, 'SEARCH-BING', `初始搜索计数器 | mobile=${missingPoints.mobilePoints} | desktop=${missingPoints.desktopPoints} | edge=${missingPoints.edgePoints}`);
            this.bot.logger.info(isMobile, 'SEARCH-BING', `剩余搜索积分 | Edge=${missingPoints.edgePoints} | Desktop=${missingPoints.desktopPoints} | Mobile=${missingPoints.mobilePoints}`);
            const queryCore = new QueryEngine_1.QueryCore(this.bot);
            const locale = (this.bot.userData.geoLocale ?? 'US').toUpperCase();
            const langCode = (this.bot.userData.langCode ?? 'en').toLowerCase();
            this.bot.logger.debug(isMobile, 'SEARCH-BING', `通过QueryCore解析搜索查询 | locale=${locale} | lang=${langCode} | related=true`);
            // 根据地区选择查询方式，如果是CN地区则使用中国热搜
            let queries = await queryCore.queryManager({
                shuffle: true,
                related: true,
                langCode,
                geoLocale: locale,
                // sourceOrder: ['google', 'wikipedia', 'reddit', 'local']
                sourceOrder: ['china', 'local']
            });
            queries = [...new Set(queries.map(q => q.trim()).filter(Boolean))];
            const timeoutBudget = (0, SearchExecution_1.calculateSearchTimeoutBudget)({
                searchDelayMax: this.bot.config.searchSettings.searchDelay.max,
                searchResultVisitTime: this.bot.config.searchSettings.searchResultVisitTime,
                interactionTimeout: this.bot.config.globalTimeout,
                scrollRandomResults: this.bot.config.searchSettings.scrollRandomResults,
                clickRandomResults: this.bot.config.searchSettings.clickRandomResults
            });
            const roundTimeoutMs = (0, SearchExecution_1.calculateSearchRoundTimeoutMs)(timeoutBudget.queryTimeoutMs, initialMissingPointsTotal, queries.length);
            const roundDeadline = roundStartedAt + roundTimeoutMs;
            this.bot.logger.info(isMobile, 'SEARCH-BING', `搜索查询池准备就绪 | count=${queries.length}`);
            this.bot.logger.debug(isMobile, 'SEARCH-BING', `搜索超时预算 | queryTimeoutMs=${timeoutBudget.queryTimeoutMs} | roundTimeoutMs=${roundTimeoutMs} | searchDelayMaxMs=${timeoutBudget.stageTimeouts['search-delay']} | dashboardRefreshMs=${timeoutBudget.stageTimeouts['dashboard-refresh']}`);
            // 跳转到bing（确保使用国际版视图以正常累积微软 Rewards 积分）
            try {
                const cookiesToAdd = [
                    { name: 'SRCHHPGUSR', value: 'SRCHLANGV2=&CW=1920&CH=1080&DPR=1&UTC=480&DM=0&ENSEARCH=1', domain: '.bing.com', path: '/' },
                    { name: 'SRCHHPGUSR', value: 'SRCHLANGV2=&CW=1920&CH=1080&DPR=1&UTC=480&DM=0&ENSEARCH=1', domain: 'cn.bing.com', path: '/' },
                    { name: '_EDGE_S', value: 'mkt=zh-cn', domain: '.bing.com', path: '/' },
                    { name: '_EDGE_S', value: 'mkt=zh-cn', domain: 'cn.bing.com', path: '/' }
                ];
                await page.context().addCookies(cookiesToAdd).catch(() => {});
            } catch {}
            let targetUrl = this.searchPageURL ? this.searchPageURL : this.bingHome;
            if (targetUrl.includes('bing.com') && !targetUrl.includes('ensearch=1')) {
                targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'ensearch=1';
            }
            const target = new URL(targetUrl);
            this.bot.logger.debug(isMobile, 'SEARCH-BING', `导航到搜索页面 | host=${target.hostname} | path=${target.pathname}`);
            await page.goto(targetUrl, {
                waitUntil: 'domcontentloaded',
                timeout: timeoutBudget.navigationMs
            });
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
            await this.bot.browser.utils.tryDismissAllMessages(page);
            // 检查是否停留在国内版，如果是则主动点击切换到"国际版"
            try {
                const intlSelector = 'a#est_en, a:has-text("国际版"), [data-testid="est_en"]';
                const intlTab = await page.waitForSelector(intlSelector, { state: 'visible', timeout: 2000 }).catch(() => null);
                if (intlTab) {
                    this.bot.logger.info(isMobile, 'SEARCH-BING', '检测到"国际版"切换入口，主动切换到必应国际版以启用积分奖励');
                    await this.bot.browser.utils.ghostClick(page, intlSelector);
                    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
                    await this.bot.utils.wait(1500);
                }
            } catch {}
            let stagnantLoop = 0;
            const stagnantLoopMax = 10;
            let isStagnant = false;
            for (let i = 0; i < queries.length; i++) {
                if (Date.now() >= roundDeadline) {
                    throw new Error(`搜索整轮超时: ${roundTimeoutMs}ms`);
                }
                const query = queries[i];
                searchCounters = await this.bingSearch(page, query, isMobile, timeoutBudget);
                let gainedPoints = 0;
                let newMissingPointsTotal = missingPointsTotal;
                let counterOk = false;

                if (searchCounters) {
                    const newMissingPoints = this.bot.browser.func.missingSearchPoints(searchCounters, isMobile);
                    if (!this.counterUnavailable(newMissingPoints, isMobile)) {
                        newMissingPointsTotal = newMissingPoints.totalPoints;
                        const rawGained = missingPointsTotal - newMissingPointsTotal;
                        gainedPoints = Math.max(0, rawGained);
                        counterOk = true;
                    }
                }

                // 若计数器未识别（如国内移动端搜索，接口中 mobileSearch counter 缺失），
                // 直接通过检测用户实际账户余额变化计算获得积分
                if (!counterOk) {
                    const curBal = await this.bot.browser.func.getCurrentPoints().catch(() => null);
                    const prevBal = Number(this.bot.userData.currentPoints ?? startBalance);
                    if (curBal !== null && curBal > prevBal) {
                        gainedPoints = curBal - prevBal;
                        this.bot.userData.currentPoints = curBal;
                        newMissingPointsTotal = Math.max(0, missingPointsTotal - gainedPoints);
                    } else {
                        gainedPoints = 0;
                        newMissingPointsTotal = missingPointsTotal;
                    }
                }

                if (gainedPoints === 0) {
                    stagnantLoop++;
                    this.bot.logger.info(isMobile, 'SEARCH-BING', `未获得积分 ${stagnantLoop}/${stagnantLoopMax} | queryLength=${query.length} | remaining=${newMissingPointsTotal}`);
                }
                else {
                    stagnantLoop = 0;
                    const newBalance = Number(this.bot.userData.currentPoints ?? 0) + gainedPoints;
                    this.bot.recordPointGain(isMobile ? '移动搜索' : 'PC搜索', gainedPoints, newBalance, taskKey);
                    totalGainedPoints += gainedPoints;
                    if (accountEmail) {
                        (0, TaskProgressStore_1.updateSearchTaskProgress)(accountEmail, taskKey, totalGainedPoints, newMissingPointsTotal, initialMissingPointsTotal);
                    }
                    this.bot.logger.info(isMobile, 'SEARCH-BING', `获得积分=${gainedPoints} points | queryLength=${query.length} | remaining=${newMissingPointsTotal}`, 'green');
                }
                missingPointsTotal = newMissingPointsTotal;
                latestMissingPointsTotal = newMissingPointsTotal;
                if (missingPointsTotal === 0) {
                    this.bot.logger.info(isMobile, 'SEARCH-BING', '已获得所有必需的搜索积分，停止主搜索循环');
                    break;
                }
                if (stagnantLoop >= stagnantLoopMax) {
                    this.bot.logger.warn(isMobile, 'SEARCH-BING', `搜索在 ${stagnantLoopMax} 次迭代中未获得积分，判定为无搜索额度或已达上限，优雅退出`);
                    isStagnant = true;
                    stagnantLoop = 0;
                    break;
                }
                const remainingQueries = queries.length - (i + 1);
                const minBuffer = 20;
                if (missingPointsTotal > 0 && remainingQueries < minBuffer) {
                    this.bot.logger.warn(isMobile, 'SEARCH-BING', `在仍有积分缺失的情况下查询缓冲区过低，重新生成 | remainingQueries=${remainingQueries} | missing=${missingPointsTotal}`);
                    const extra = await queryCore.queryManager({
                        shuffle: true,
                        related: true,
                        langCode,
                        geoLocale: locale,
                        sourceOrder: this.bot.config.searchSettings.queryEngines
                    });
                    const merged = [...queries, ...extra].map(q => q.trim()).filter(Boolean);
                    queries = [...new Set(merged)];
                    queries = this.bot.utils.shuffleArray(queries);
                    this.bot.logger.debug(isMobile, 'SEARCH-BING', `查询池已重新生成 | count=${queries.length}`);
                }
            }
            if (missingPointsTotal > 0 && !isStagnant) {
                this.bot.logger.info(isMobile, 'SEARCH-BING', `搜索完成但仍有积分缺失，继续使用重新生成的查询 | remaining=${missingPointsTotal}`);
                let stagnantLoop = 0;
                const stagnantLoopMax = 5;
                while (missingPointsTotal > 0) {
                    const extra = await queryCore.queryManager({
                        shuffle: true,
                        related: true,
                        langCode,
                        geoLocale: locale,
                        sourceOrder: this.bot.config.searchSettings.queryEngines
                    });
                    const merged = [...queries, ...extra].map(q => q.trim()).filter(Boolean);
                    const newPool = [...new Set(merged)];
                    queries = this.bot.utils.shuffleArray(newPool);
                    this.bot.logger.info(isMobile, 'SEARCH-BING-EXTRA', `新搜索查询池已生成 | count=${queries.length}`);
                    for (const query of queries) {
                        if (Date.now() >= roundDeadline) {
                            throw new Error(`搜索整轮超时: ${roundTimeoutMs}ms`);
                        }
                        this.bot.logger.info(isMobile, 'SEARCH-BING-EXTRA', `额外搜索 | remaining=${missingPointsTotal} | queryLength=${query.length}`);
                        searchCounters = await this.bingSearch(page, query, isMobile, timeoutBudget);
                        let gainedPoints = 0;
                        let newMissingPointsTotal = missingPointsTotal;
                        let counterOk = false;

                        if (searchCounters) {
                            const newMissingPoints = this.bot.browser.func.missingSearchPoints(searchCounters, isMobile);
                            if (!this.counterUnavailable(newMissingPoints, isMobile)) {
                                newMissingPointsTotal = newMissingPoints.totalPoints;
                                const rawGained = missingPointsTotal - newMissingPointsTotal;
                                gainedPoints = Math.max(0, rawGained);
                                counterOk = true;
                            }
                        }

                        if (!counterOk) {
                            const curBal = await this.bot.browser.func.getCurrentPoints().catch(() => null);
                            const prevBal = Number(this.bot.userData.currentPoints ?? startBalance);
                            if (curBal !== null && curBal > prevBal) {
                                gainedPoints = curBal - prevBal;
                                this.bot.userData.currentPoints = curBal;
                                newMissingPointsTotal = Math.max(0, missingPointsTotal - gainedPoints);
                            } else {
                                gainedPoints = 0;
                                newMissingPointsTotal = missingPointsTotal;
                            }
                        }

                        if (gainedPoints === 0) {
                            stagnantLoop++;
                            this.bot.logger.info(isMobile, 'SEARCH-BING-EXTRA', `未获得积分 ${stagnantLoop}/${stagnantLoopMax} | queryLength=${query.length} | remaining=${newMissingPointsTotal}`);
                        }
                        else {
                            stagnantLoop = 0;
                            const newBalance = Number(this.bot.userData.currentPoints ?? 0) + gainedPoints;
                            this.bot.recordPointGain(isMobile ? '移动搜索' : 'PC搜索', gainedPoints, newBalance, taskKey);
                            totalGainedPoints += gainedPoints;
                            if (accountEmail) {
                                (0, TaskProgressStore_1.updateSearchTaskProgress)(accountEmail, taskKey, totalGainedPoints, newMissingPointsTotal, initialMissingPointsTotal);
                            }
                            this.bot.logger.info(isMobile, 'SEARCH-BING-EXTRA', `获得积分=${gainedPoints} points | queryLength=${query.length} | remaining=${newMissingPointsTotal}`, 'green');
                        }
                        missingPointsTotal = newMissingPointsTotal;
                        latestMissingPointsTotal = newMissingPointsTotal;
                        if (missingPointsTotal === 0) {
                            this.bot.logger.info(isMobile, 'SEARCH-BING-EXTRA', '在额外搜索期间已获得所有必需的搜索积分');
                            break;
                        }
                        if (stagnantLoop >= stagnantLoopMax) {
                            this.bot.logger.warn(isMobile, 'SEARCH-BING-EXTRA', `搜索在 ${stagnantLoopMax} 次迭代中未获得积分，中止额外搜索`);
                            const finalBalance = Number(this.bot.userData.currentPoints ?? startBalance);
                            this.bot.logger.info(isMobile, 'SEARCH-BING', `优雅结束额外搜索 | startBalance=${startBalance} | finalBalance=${finalBalance} | totalGained=${totalGainedPoints}`);
                            break;
                        }
                    }
                }
            }
            const finalBalance = Number(this.bot.userData.currentPoints ?? startBalance);
            if (accountEmail) {
                (0, TaskProgressStore_1.updateSearchTaskProgress)(accountEmail, taskKey, totalGainedPoints, latestMissingPointsTotal, initialMissingPointsTotal);
            }
            this.bot.logger.info(isMobile, 'SEARCH-BING', `完成必应搜索 | startBalance=${startBalance} | newBalance=${finalBalance}`);
            return totalGainedPoints;
        }
        catch (error) {
            this.bot.logger.error(isMobile, 'SEARCH-BING', `doSearch中出现错误 | message=${error instanceof Error ? error.message : String(error)}，安全退出以保全账号任务`);
            const finalBalance = Number(this.bot.userData.currentPoints ?? startBalance);
            if (accountEmail) {
                (0, TaskProgressStore_1.updateSearchTaskProgress)(accountEmail, taskKey, totalGainedPoints, latestMissingPointsTotal, initialMissingPointsTotal);
            }
            return totalGainedPoints;
        }
    }
    async bingSearch(searchPage, query, isMobile, timeoutBudget) {
        const controller = new AbortController();
        const queryDeadline = Date.now() + timeoutBudget.queryTimeoutMs;
        return this.performBingSearch(searchPage, query, isMobile, timeoutBudget, controller, queryDeadline);
    }
    async executeStage(searchPage, isMobile, controller, queryDeadline, stage, stageTimeoutMs, operation) {
        const remainingMs = Math.max(1, queryDeadline - Date.now());
        const timeoutMs = Math.min(stageTimeoutMs, remainingMs);
        const startedAt = Date.now();
        this.bot.logger.debug(isMobile, 'SEARCH-QUERY', `阶段开始 | stage=${stage} | timeoutMs=${timeoutMs}`);
        try {
            const result = await (0, SearchExecution_1.runSearchStage)({
                page: searchPage,
                controller,
                stage,
                timeoutMs,
                operation
            });
            this.bot.logger.debug(isMobile, 'SEARCH-QUERY', `阶段完成 | stage=${stage} | elapsedMs=${Date.now() - startedAt}`);
            return result;
        }
        catch (error) {
            const operationError = error instanceof SearchExecution_1.SearchOperationError
                ? error
                : new SearchExecution_1.SearchOperationError(stage, `搜索阶段失败 | stage=${stage}`, timeoutMs, Date.now() - startedAt, false, { cause: error });
            this.bot.logger.error(isMobile, 'SEARCH-QUERY', `阶段失败 | stage=${operationError.operationStage} | elapsedMs=${operationError.elapsedMs} | timeoutMs=${operationError.timeoutMs} | timedOut=${operationError.timedOut} | message=${operationError.message}`);
            throw operationError;
        }
    }
    async performBingSearch(searchPage, query, isMobile, timeoutBudget, controller, queryDeadline) {
        const maxAttempts = SearchExecution_1.SEARCH_PRE_SUBMIT_ATTEMPTS;
        const refreshThreshold = 10; // 页面在x次搜索后变得缓慢？
        this.searchCount++;
        if (this.searchCount % refreshThreshold === 0) {
            this.bot.logger.info(isMobile, 'SEARCH-BING', `返回主页以清除累积的页面上下文 | count=${this.searchCount} | threshold=${refreshThreshold}`);
            this.bot.logger.debug(isMobile, 'SEARCH-BING', `返回主页以刷新状态 | url=${this.bingHome}`);
            const cvid = (0, crypto_1.randomBytes)(16).toString('hex');
            let baseBing = this.bingHome;
            if (baseBing.includes('?')) baseBing = baseBing.split('?')[0];
            const url = `${baseBing}/search?q=${encodeURIComponent(query)}&PC=U531&FORM=ANNTA1&cvid=${cvid}&ensearch=1`;
            await this.executeStage(searchPage, isMobile, controller, queryDeadline, 'search-box', timeoutBudget.navigationMs, async (signal) => {
                signal.throwIfAborted();
                await searchPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                signal.throwIfAborted();
                await searchPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
                signal.throwIfAborted();
                await this.bot.browser.utils.tryDismissAllMessages(searchPage);
            });
        }
        // 每次搜索重置首次滚动标志，确保有初始向下滚动
        this.firstScroll = true;
        this.bot.logger.debug(isMobile, 'SEARCH-BING', `开始bingSearch | queryLength=${query.length} | maxAttempts=${maxAttempts} | searchCount=${this.searchCount} | refreshEvery=${refreshThreshold} | scrollRandomResults=${this.bot.config.searchSettings.scrollRandomResults} | clickRandomResults=${this.bot.config.searchSettings.clickRandomResults}`);
        let submitted = false;
        if (isMobile) {
            // 移动端在搜索结果页通常折叠搜索框，直接通过 URL 导航执行搜索，速度极快且 100% 稳定
            const cvid = (0, crypto_1.randomBytes)(16).toString('hex');
            let baseBing = this.bingHome;
            if (baseBing.includes('?')) baseBing = baseBing.split('?')[0];
            const mobileSearchUrl = `${baseBing}/search?q=${encodeURIComponent(query)}&search=&form=QBLHCN&cvid=${cvid}`;
            await this.executeStage(searchPage, isMobile, controller, queryDeadline, 'submit', timeoutBudget.navigationMs, async (signal) => {
                signal.throwIfAborted();
                await searchPage.goto(mobileSearchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                signal.throwIfAborted();
                await searchPage.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
                signal.throwIfAborted();
                await this.bot.browser.utils.tryDismissAllMessages(searchPage);
            });
            submitted = true;
            this.bot.logger.debug(isMobile, 'SEARCH-BING', `移动端直接导航搜索成功 | queryLength=${query.length}`);
        } else {
            for (let i = 0; i < maxAttempts && !submitted; i++) {
                try {
                    const searchBar = '#sb_form_q';
                    const searchBox = searchPage.locator(searchBar);
                    await this.executeStage(searchPage, isMobile, controller, queryDeadline, 'search-box', timeoutBudget.stageTimeouts['search-box'], async (signal) => {
                        signal.throwIfAborted();
                        await searchPage.evaluate(() => {
                            window.scrollTo({ left: 0, top: 0, behavior: 'auto' });
                        });
                        await searchPage.keyboard.press('Home');
                        await searchBox.waitFor({ state: 'visible', timeout: 15000 });
                    });
                    await this.executeStage(searchPage, isMobile, controller, queryDeadline, 'submit', timeoutBudget.stageTimeouts.submit, async (signal) => {
                        await (0, SearchExecution_1.abortableWait)(1000, signal);
                        await searchPage.evaluate(() => {
                            const form = document.querySelector('#sb_form');
                            if (form && !form.querySelector('input[name="ensearch"]')) {
                                const input = document.createElement('input');
                                input.type = 'hidden';
                                input.name = 'ensearch';
                                input.value = '1';
                                form.appendChild(input);
                            }
                        }).catch(() => {});
                        await searchBox.click({ clickCount: 3, timeout: 5000 });
                        signal.throwIfAborted();
                        await searchBox.fill('');
                        await searchPage.keyboard.type(query, { delay: 50 });
                        signal.throwIfAborted();
                        await searchPage.keyboard.press('Enter');
                    });
                    submitted = true;
                    this.bot.logger.debug(isMobile, 'SEARCH-BING', `提交查询到必应 | attempt=${i + 1}/${maxAttempts} | queryLength=${query.length}`);
                }
                catch (error) {
                    if (error instanceof SearchExecution_1.SearchOperationError && error.timedOut)
                        throw error;
                    if (i >= maxAttempts - 1 || searchPage.isClosed()) {
                        this.bot.logger.error(isMobile, 'SEARCH-BING', `提交前重试耗尽 | attempts=${maxAttempts} | queryLength=${query.length} | message=${error instanceof Error ? error.message : String(error)}`);
                        throw error;
                    }
                    this.bot.logger.error(isMobile, 'SEARCH-BING', `提交前搜索尝试失败 | attempt=${i + 1}/${maxAttempts} | queryLength=${query.length} | message=${error instanceof Error ? error.message : String(error)}`);
                    this.bot.logger.warn(isMobile, 'SEARCH-BING', `重试搜索 | attempt=${i + 1}/${maxAttempts} | queryLength=${query.length}`);
                    await (0, SearchExecution_1.abortableWait)(timeoutBudget.retryDelayMs, controller.signal);
                }
            }
        }
        if (!submitted)
            throw new Error(`搜索查询提交失败 | queryLength=${query.length}`);
        await this.executeStage(searchPage, isMobile, controller, queryDeadline, 'post-submit-wait', timeoutBudget.stageTimeouts['post-submit-wait'], signal => (0, SearchExecution_1.abortableWait)(3000, signal));
        if (this.bot.config.searchSettings.scrollRandomResults) {
            await this.executeStage(searchPage, isMobile, controller, queryDeadline, 'scroll', timeoutBudget.stageTimeouts.scroll, async (signal) => {
                await (0, SearchExecution_1.abortableWait)(2000, signal);
                await this.randomScroll(searchPage, isMobile, signal);
            });
        }
        if (this.bot.config.searchSettings.clickRandomResults) {
            await this.executeStage(searchPage, isMobile, controller, queryDeadline, 'click', timeoutBudget.stageTimeouts.click, async (signal) => {
                await (0, SearchExecution_1.abortableWait)(2000, signal);
                await this.clickRandomLink(searchPage, isMobile, signal, this.bot.utils.stringToNumber(this.bot.config.searchSettings.searchResultVisitTime));
            });
        }
        const searchDelayMs = this.bot.utils.randomDelay(this.bot.config.searchSettings.searchDelay.min, this.bot.config.searchSettings.searchDelay.max);
        await this.executeStage(searchPage, isMobile, controller, queryDeadline, 'search-delay', timeoutBudget.stageTimeouts['search-delay'], signal => (0, SearchExecution_1.abortableWait)(searchDelayMs, signal));
        let counters = null;
        try {
            counters = await this.executeStage(searchPage, isMobile, controller, queryDeadline, 'dashboard-refresh', timeoutBudget.stageTimeouts['dashboard-refresh'], () => this.bot.browser.func.getSearchPoints());
        } catch (refreshErr) {
            this.bot.logger.warn(isMobile, 'SEARCH-BING', `刷新搜索计数器遇到临时网络波动: ${refreshErr instanceof Error ? refreshErr.message : String(refreshErr)}，安全降级`);
            counters = null;
        }
        this.bot.logger.debug(isMobile, 'SEARCH-BING', `查询后的搜索计数器 | queryLength=${query.length} | searchCount=${this.searchCount}`);
        return counters;
    }
    async randomScroll(page, isMobile, signal) {
        try {
            signal.throwIfAborted();
            const viewportHeight = await page.evaluate(() => window.innerHeight);
            const totalHeight = await page.evaluate(() => document.body.scrollHeight);
            const randomScrollPosition = Math.floor(Math.random() * (totalHeight - viewportHeight));
            this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-SCROLL', `随机滚动 | 视口高度=${viewportHeight} | 总高度=${totalHeight} | 滚动位置=${randomScrollPosition}`);
            await page.evaluate((scrollPos) => {
                window.scrollTo({ left: 0, top: scrollPos, behavior: 'auto' });
            }, randomScrollPosition);
            signal.throwIfAborted();
        }
        catch (error) {
            if (signal.aborted)
                throw signal.reason ?? error;
            this.bot.logger.error(isMobile, 'SEARCH-RANDOM-SCROLL', `随机滚动过程中出现错误 | message=${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async clickRandomLink(page, isMobile, signal, visitTimeMs) {
        try {
            this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', '尝试点击随机搜索结果链接');
            const searchPageUrl = page.url();
            const pagesBeforeClick = new Set(page.context().pages());
            signal.throwIfAborted();
            const resultLink = page.locator('#b_results .b_algo h2 a').first();
            const clicked = await resultLink
                .waitFor({ state: 'visible', timeout: 5000 })
                .then(async () => {
                await resultLink.click({ timeout: 10000 });
                return true;
            })
                .catch(() => false);
            signal.throwIfAborted();
            if (!clicked) {
                this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', '未找到可点击结果，跳过本次随机访问');
                return;
            }
            await (0, SearchExecution_1.abortableWait)(visitTimeMs, signal);
            const openedPages = page
                .context()
                .pages()
                .filter(candidate => candidate !== page && !pagesBeforeClick.has(candidate));
            if (openedPages.length > 0) {
                await Promise.allSettled(openedPages.map(openedPage => openedPage.close({ runBeforeUnload: false })));
                this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', `已关闭本次打开的结果标签页 | count=${openedPages.length}`);
            }
            else if (page.url() !== searchPageUrl) {
                await page.goto(searchPageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', '结果在当前标签页打开，已返回搜索页面');
            }
            else {
                this.bot.logger.debug(isMobile, 'SEARCH-RANDOM-CLICK', '点击未产生新标签或导航，继续搜索');
            }
            signal.throwIfAborted();
        }
        catch (error) {
            if (signal.aborted)
                throw signal.reason ?? error;
            this.bot.logger.error(isMobile, 'SEARCH-RANDOM-CLICK', `随机点击过程中出现错误 | message=${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.Search = Search;
//# sourceMappingURL=Search.js.map