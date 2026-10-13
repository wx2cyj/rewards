"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesktopApp = void 0;
const Workers_1 = require("../../Workers");

const DESKTOP_APP_HEADERS = {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) MSRewards/Desktop/1.4.56',
    'X-MSRewards-App': '1',
    'X-Rewards-Source': 'msrewards-desktop'
};

class DesktopApp extends Workers_1.Workers {
    async doDesktopApp() {
        this.bot.logger.info(this.bot.isMobile, 'DESKTOP-APP', '开始扫描桌面客户端每周专属任务 (Desktop App Weekly Exclusive)...');
        try {
            const earnUrl = 'https://rewards.bing.com/earn';
            const cookieHeader = this.bot.browser.func.buildCookieHeaderForUrl(this.bot.cookies.desktop, earnUrl);

            // 1. 请求 earn 页面检测是否有专属打孔卡任务链接
            const earnResponse = await this.bot.axios.request({
                url: earnUrl,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    Cookie: cookieHeader,
                    Referer: 'https://rewards.bing.com/'
                }
            });
            const earnHtml = typeof earnResponse.data === 'string' ? earnResponse.data : String(earnResponse.data ?? '');

            // 匹配专属 Quest 链接：WW_pcparent_RewardsApp_weekly_Exclusive...
            const questMatch = earnHtml.match(/href=["'](\/earn\/quest\/(WW_pcparent_RewardsApp_weekly_Exclusive[^"']+))["']/i) ||
                               earnHtml.match(/["'](\/earn\/quest\/(WW_pcparent_RewardsApp_weekly_Exclusive[^"']+))["']/i);

            if (!questMatch) {
                this.bot.logger.info(this.bot.isMobile, 'DESKTOP-APP', '未检测到桌面客户端每周专属打孔卡任务（可能本周未开启或已完成）');
                return;
            }

            const questPath = questMatch[1];
            const questUrl = `https://rewards.bing.com${questPath}`;
            this.bot.logger.info(this.bot.isMobile, 'DESKTOP-APP', `发现桌面客户端每周专属任务入口: ${questPath}`);

            // 2. 伪装 Desktop App 客户端请求头获取任务详情页面
            const questResponse = await this.bot.axios.request({
                url: questUrl,
                method: 'GET',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    ...DESKTOP_APP_HEADERS,
                    Cookie: cookieHeader,
                    Referer: earnUrl
                }
            });
            const questHtml = typeof questResponse.data === 'string' ? questResponse.data : String(questResponse.data ?? '');

            // 3. 解析 Flight Chunks 或页面文本提取子任务
            const chunks = [];
            const pushRegex = /self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)/gs;
            let mFlight;
            while ((mFlight = pushRegex.exec(questHtml)) !== null) {
                try {
                    chunks.push(JSON.parse(`"${mFlight[1]}"`));
                } catch {}
            }
            const fullFlightText = chunks.length > 0 ? chunks.join('') : questHtml.replace(/\\"/g, '"');

            const childOffers = [];
            const seenOffers = new Set();
            const qOfferRegex = /\{[^{}]*?"offerId"\s*:\s*"(WW_pcchild\d+[^"]+)"[^{}]*?\}/g;
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
                this.bot.logger.info(this.bot.isMobile, 'DESKTOP-APP', '未能从专属打孔卡页面中解析出子任务项');
                return;
            }

            this.bot.logger.info(this.bot.isMobile, 'DESKTOP-APP', `专属打孔卡共识别到 ${childOffers.length} 个子任务项`);

            // 筛选未完成且未锁定的子任务
            const pendingTasks = childOffers.filter(item => item.isCompleted !== true && item.isLocked !== true);
            if (!pendingTasks.length) {
                this.bot.logger.info(this.bot.isMobile, 'DESKTOP-APP', '所有桌面专享子任务今日已完成或全部锁定', 'green');
                return;
            }

            this.bot.logger.info(this.bot.isMobile, 'DESKTOP-APP', `发现 ${pendingTasks.length} 个待完成的桌面专享打卡任务`);

            // 4. 逐个执行打卡
            for (const task of pendingTasks) {
                const oldBalance = await this.bot.browser.func.getCurrentPoints();
                const taskLabel = task.title || task.name || task.offerId;
                this.bot.logger.info(this.bot.isMobile, 'DESKTOP-APP', `正在打卡桌面专享任务: ${taskLabel} (当前积分: ${oldBalance})`);

                const success = await this.claimDesktopTask(task, earnUrl, cookieHeader);
                await this.bot.utils.wait(this.bot.utils.randomDelay(3500, 6500));

                const newBalance = await this.bot.browser.func.getCurrentPoints();
                const gained = Math.max(0, newBalance - oldBalance);
                if (gained > 0) {
                    this.bot.recordPointGain('桌面应用专享', gained, newBalance);
                    this.bot.logger.info(this.bot.isMobile, 'DESKTOP-APP', `桌面专享任务完成: ${taskLabel} | 获得 +${gained} 分 | 新余额: ${newBalance}`, 'green');
                } else if (success) {
                    this.bot.logger.info(this.bot.isMobile, 'DESKTOP-APP', `桌面专享任务已上报提交: ${taskLabel} (积分已同步或待延迟结算)`);
                } else {
                    this.bot.logger.warn(this.bot.isMobile, 'DESKTOP-APP', `桌面专享任务提交未确认: ${taskLabel}`);
                }
            }
        } catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'DESKTOP-APP', `执行桌面客户端专属任务出错: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async claimDesktopTask(task, earnUrl, cookieHeader) {
        // 策略 1: Next.js Server Action 上报
        try {
            let actionHash = this.bot.serverActions?.hashes?.reportActivity;
            if (!actionHash) {
                actionHash = '707e6eb15bdfdd5fba193f0a77e934f7018faf87ce'; // 默认保底 action hash
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
                url: earnUrl,
                method: 'POST',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    ...DESKTOP_APP_HEADERS,
                    'content-type': 'text/plain;charset=UTF-8',
                    'next-action': actionHash,
                    Cookie: cookieHeader,
                    Referer: earnUrl
                },
                data: payload
            });
            const resStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            if (resStr.includes('true') || resStr.includes('"i":false') || resStr.includes('"a":') || response.status === 200) {
                return true;
            }
        } catch (e) {
            this.bot.logger.debug(this.bot.isMobile, 'DESKTOP-APP', `Server Action 上报失败，尝试备用接口: ${e instanceof Error ? e.message : String(e)}`);
        }

        // 策略 2: cn.bing.com v1 reportactivity 兜底
        try {
            const reportUrl = 'https://cn.bing.com/msrewards/api/v1/reportactivity';
            const res = await this.bot.axios.request({
                url: reportUrl,
                method: 'POST',
                headers: {
                    ...(this.bot.fingerprint?.headers ?? {}),
                    ...DESKTOP_APP_HEADERS,
                    Cookie: this.bot.browser.func.buildCookieHeaderForUrl(this.bot.cookies.desktop, reportUrl),
                    Origin: 'https://cn.bing.com',
                    Referer: 'https://cn.bing.com/'
                },
                data: {
                    ActivityCount: 1,
                    OfferId: task.offerId,
                    AuthKey: task.hash
                }
            });
            return res.status === 200;
        } catch {}

        return false;
    }
}
exports.DesktopApp = DesktopApp;
//# sourceMappingURL=DesktopApp.js.map
