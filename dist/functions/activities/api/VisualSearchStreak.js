"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualSearchStreak = void 0;
const Workers_1 = require("../../Workers");

class VisualSearchStreak extends Workers_1.Workers {
    async doVisualSearchStreak() {
        this.bot.logger.info(this.bot.isMobile, 'VISUAL-SEARCH', '开始检查并维持必应视觉搜索连续打卡 (vsstreak)...');
        try {
            const targetUrl = 'https://www.bing.com/?features=vsstreak,vstooltip&form=ML2XES';
            const activeCookies = (this.bot.cookies.desktop && this.bot.cookies.desktop.length > 0)
                ? this.bot.cookies.desktop
                : this.bot.cookies.mobile;
            const cookieHeader = this.bot.browser.func.buildCookieHeaderForUrl(activeCookies, targetUrl);

            const response = await this.bot.axios.request({
                url: targetUrl,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
                    Cookie: cookieHeader,
                    Referer: 'https://www.bing.com/'
                },
                timeout: 10000
            });

            if (response.status === 200) {
                this.bot.logger.info(this.bot.isMobile, 'VISUAL-SEARCH', '必应视觉搜索连续打卡请求已成功提交 (HTTP 200)', 'green');
            } else {
                this.bot.logger.warn(this.bot.isMobile, 'VISUAL-SEARCH', `必应视觉搜索打卡返回状态码: ${response.status}`);
            }
        } catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'VISUAL-SEARCH', `必应视觉搜索打卡异常 (已安全跳过): ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.VisualSearchStreak = VisualSearchStreak;
