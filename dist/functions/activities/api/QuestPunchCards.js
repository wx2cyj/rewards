"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestPunchCards = void 0;
const Workers_1 = require("../../Workers");

const PC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

class QuestPunchCards extends Workers_1.Workers {
    async doQuestPunchCards() {
        this.bot.logger.info(this.bot.isMobile, 'QUEST-CARDS', '开始扫描任务区动态专题打孔卡 (每月重点/节日/合作品牌打孔卡)...');
        try {
            const earnUrl = 'https://rewards.bing.com/earn';
            const activeCookies = (this.bot.cookies.desktop && this.bot.cookies.desktop.length > 0)
                ? this.bot.cookies.desktop
                : this.bot.cookies.mobile;
            const cookieHeader = this.bot.browser.func.buildCookieHeaderForUrl(activeCookies, earnUrl);

            // 1. 请求 earn 页面扫描全部打孔卡链接
            const earnResponse = await this.bot.axios.request({
                url: earnUrl,
                method: 'GET',
                headers: {
                    'User-Agent': PC_USER_AGENT,
                    Cookie: cookieHeader,
                    Referer: 'https://rewards.bing.com/'
                },
                timeout: 15000
            });
            const earnHtml = typeof earnResponse.data === 'string' ? earnResponse.data : String(earnResponse.data ?? '');

            // 匹配所有 /earn/quest/(...) 入口
            const questRegex = /href=["'](\/earn\/quest\/([^"'\s?]+))["']/gi;
            const quests = [];
            const seenQuestIds = new Set();
            let match;
            while ((match = questRegex.exec(earnHtml)) !== null) {
                const questPath = match[1];
                const questId = match[2];
                // 排除已在 DesktopApp 中专门处理的桌面专属任务以及新用户引导
                if (questId.includes('RewardsApp_weekly_Exclusive') || questId.includes('newuser_onboarding') || seenQuestIds.has(questId)) {
                    continue;
                }
                seenQuestIds.add(questId);
                quests.push({ questId, questPath, url: `https://rewards.bing.com${questPath}` });
            }

            if (quests.length === 0) {
                this.bot.logger.info(this.bot.isMobile, 'QUEST-CARDS', '未发现可处理的额外专题打孔卡（或当前无在线月度/节日活动）');
                return;
            }

            this.bot.logger.info(this.bot.isMobile, 'QUEST-CARDS', `发现 ${quests.length} 个专题打孔卡入口: ${quests.map(q => q.questId).join(', ')}`);

            for (const quest of quests) {
                await this.processSingleQuest(quest, earnUrl, cookieHeader);
                await this.bot.utils.wait(this.bot.utils.randomDelay(2000, 4000));
            }
        } catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'QUEST-CARDS', `扫描专题打孔卡异常 (已安全跳过): ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async processSingleQuest(quest, earnUrl, cookieHeader) {
        this.bot.logger.info(this.bot.isMobile, 'QUEST-CARDS', `正在检查打孔卡: ${quest.questId}`);
        try {
            const questResponse = await this.bot.axios.request({
                url: quest.url,
                method: 'GET',
                headers: {
                    'User-Agent': PC_USER_AGENT,
                    Cookie: cookieHeader,
                    Referer: earnUrl
                },
                timeout: 15000
            });
            const questHtml = typeof questResponse.data === 'string' ? questResponse.data : String(questResponse.data ?? '');

            // 解析 Next.js Flight Chunks
            const chunks = [];
            const pushRegex = /self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)/gs;
            let mFlight;
            while ((mFlight = pushRegex.exec(questHtml)) !== null) {
                try {
                    chunks.push(JSON.parse(`"${mFlight[1]}"`));
                } catch {}
            }
            const fullFlightText = chunks.length > 0 ? chunks.join('') : questHtml.replace(/\\"/g, '"');

            // 提取子任务列表
            const childOffers = [];
            const seenOffers = new Set();
            const qOfferRegex = /\{[^{}]*?"offerId"\s*:\s*"([^"]+)"[^{}]*?\}/g;
            let qo;
            while ((qo = qOfferRegex.exec(fullFlightText)) !== null) {
                try {
                    const qItem = JSON.parse(qo[0].replace(/:\$undefined/g, ':null').replace(/:\$D[^\",}]+/g, ':null'));
                    if (qItem.offerId && qItem.hash && !seenOffers.has(qItem.offerId)) {
                        seenOffers.add(qItem.offerId);
                        childOffers.push(qItem);
                    }
                } catch {}
            }

            if (!childOffers.length) {
                this.bot.logger.debug(this.bot.isMobile, 'QUEST-CARDS', `打孔卡 ${quest.questId} 页面未解析到子任务`);
                return;
            }

            const pendingTasks = childOffers.filter(item => item.isCompleted !== true && item.isLocked !== true);
            if (!pendingTasks.length) {
                this.bot.logger.info(this.bot.isMobile, 'QUEST-CARDS', `打孔卡 ${quest.questId} 的子任务今日均已完成或锁定`, 'green');
                return;
            }

            this.bot.logger.info(this.bot.isMobile, 'QUEST-CARDS', `打孔卡 ${quest.questId} 发现 ${pendingTasks.length} 项可推进子任务`);

            for (const task of pendingTasks) {
                const oldBalance = await this.bot.browser.func.getCurrentPoints();
                const taskLabel = task.title || task.name || task.offerId;
                this.bot.logger.info(this.bot.isMobile, 'QUEST-CARDS', `推进打孔卡任务: ${taskLabel}`);

                const success = await this.claimQuestTask(task, quest.url, cookieHeader);
                await this.bot.utils.wait(this.bot.utils.randomDelay(3000, 5500));

                const newBalance = await this.bot.browser.func.getCurrentPoints();
                const gained = Math.max(0, newBalance - oldBalance);
                if (gained > 0) {
                    this.bot.recordPointGain('专题打孔卡', gained, newBalance);
                    this.bot.logger.info(this.bot.isMobile, 'QUEST-CARDS', `打孔卡子任务完成: ${taskLabel} | +${gained} 积分 | 新余额: ${newBalance}`, 'green');
                } else if (success) {
                    this.bot.logger.info(this.bot.isMobile, 'QUEST-CARDS', `打孔卡子任务已提交: ${taskLabel} (等待官网结算)`);
                } else {
                    this.bot.logger.debug(this.bot.isMobile, 'QUEST-CARDS', `打孔卡子任务跳过或已冷却: ${taskLabel}`);
                }
            }
        } catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'QUEST-CARDS', `处理打孔卡 ${quest.questId} 异常: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async claimQuestTask(task, questUrl, cookieHeader) {
        // 策略 1: Next.js Server Action 上报
        try {
            let actionHash = this.bot.serverActions?.hashes?.reportActivity;
            if (!actionHash) {
                actionHash = '707e6eb15bdfdd5fba193f0a77e934f7018faf87ce';
            }
            const payload = JSON.stringify([
                task.hash,
                11,
                {
                    offerid: task.offerId,
                    isPromotional: '$undefined',
                    timezoneOffset: String(this.bot.userData.timezoneOffset || -480)
                }
            ]);
            const response = await this.bot.axios.request({
                url: questUrl,
                method: 'POST',
                headers: {
                    'User-Agent': PC_USER_AGENT,
                    'content-type': 'text/plain;charset=UTF-8',
                    'next-action': actionHash,
                    Cookie: cookieHeader,
                    Referer: questUrl
                },
                data: payload,
                timeout: 10000
            });
            const resStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            if (resStr.includes('true') || resStr.includes('"i":false') || resStr.includes('"a":') || response.status === 200) {
                return true;
            }
        } catch (e) {
            this.bot.logger.debug(this.bot.isMobile, 'QUEST-CARDS', `Server Action 上报失败，尝试备用接口: ${e instanceof Error ? e.message : String(e)}`);
        }

        // 策略 2: cn.bing.com v1 reportactivity 兜底
        try {
            const reportUrl = 'https://cn.bing.com/msrewards/api/v1/reportactivity';
            const res = await this.bot.axios.request({
                url: reportUrl,
                method: 'POST',
                headers: {
                    'User-Agent': PC_USER_AGENT,
                    Cookie: cookieHeader,
                    Origin: 'https://cn.bing.com',
                    Referer: 'https://cn.bing.com/'
                },
                data: {
                    ActivityCount: 1,
                    OfferId: task.offerId,
                    AuthKey: task.hash
                },
                timeout: 10000
            });
            return res.status === 200;
        } catch {}

        return false;
    }
}
exports.QuestPunchCards = QuestPunchCards;
