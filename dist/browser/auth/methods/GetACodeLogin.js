"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeLogin = void 0;
const LoginUtils_1 = require("./LoginUtils");
class CodeLogin {
    constructor(bot) {
        this.bot = bot;
        this.textInputSelector = '[data-testid="codeInputWrapper"]';
        this.secondairyInputSelector = 'input[id="otc-confirmation-input"], input[name="otc"]';
        this.maxManualSeconds = 60;
        this.maxManualAttempts = 5;
    }
    async fillCode(page, code) {
        try {
            const visibleInput = await page
                .waitForSelector(this.textInputSelector, { state: 'visible', timeout: 500 })
                .catch(() => null);
            if (visibleInput) {
                await page.keyboard.type(code, { delay: 50 });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', `Filled code input: "${code}" `);
                return true;
            }
            const secondairyInput = await page.$(this.secondairyInputSelector);
            if (secondairyInput) {
                await page.keyboard.type(code, { delay: 50 });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', `Filled code input: "${code}" `);
                return true;
            }
            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-CODE', 'No code input field found');
            return false;
        }
        catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-CODE', `Failed to fill code input: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    async handle(page) {
        try {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', '请求代码登录身份验证');
            const emailMessage = await (0, LoginUtils_1.getSubtitleMessage)(page);
            if (emailMessage) {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', `页面消息: "${emailMessage}"`);
            }
            else {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN-CODE', '无法检索邮件代码目的地');
            }
            for (let attempt = 1; attempt <= this.maxManualAttempts; attempt++) {
                const code = await (0, LoginUtils_1.promptInput)({
                    question: `输入6位代码 (等待 ${this.maxManualSeconds}秒): `,
                    timeoutSeconds: this.maxManualSeconds,
                    validate: code => /^\d{6}$/.test(code)
                });
                if (!code || !/^\d{6}$/.test(code)) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN-CODE', `无效或缺少代码 (尝试 ${attempt}/${this.maxManualAttempts}) | 输入长度=${code?.length}`);
                    if (attempt === this.maxManualAttempts) {
                        throw new Error('手动代码输入失败或超时');
                    }
                    continue;
                }
                const filled = await this.fillCode(page, code);
                if (!filled) {
                    this.bot.logger.error(this.bot.isMobile, 'LOGIN-CODE', `无法填写代码输入 (尝试 ${attempt}/${this.maxManualAttempts})`);
                    if (attempt === this.maxManualAttempts) {
                        throw new Error('未找到代码输入字段');
                    }
                    continue;
                }
                await this.bot.utils.wait(500);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
                // 检查是否输入了错误代码
                const errorMessage = await (0, LoginUtils_1.getErrorMessage)(page);
                if (errorMessage) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN-CODE', `代码不正确: ${errorMessage} (尝试 ${attempt}/${this.maxManualAttempts})`);
                    if (attempt === this.maxManualAttempts) {
                        throw new Error(`达到最大尝试次数: ${errorMessage}`);
                    }
                    // 重试前清除输入字段
                    const inputToClear = await page.$(this.textInputSelector).catch(() => null);
                    if (inputToClear) {
                        await inputToClear.click();
                        await page.keyboard.press('Control+A');
                        await page.keyboard.press('Backspace');
                    }
                    continue;
                }
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-CODE', '代码身份验证成功完成');
                return;
            }
            throw new Error(`代码输入在 ${this.maxManualAttempts} 次尝试后失败`);
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'LOGIN-CODE', `发生错误: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}
exports.CodeLogin = CodeLogin;
//# sourceMappingURL=GetACodeLogin.js.map