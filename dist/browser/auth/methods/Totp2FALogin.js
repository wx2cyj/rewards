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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TotpLogin = void 0;
const OTPAuth = __importStar(require("otpauth"));
const LoginUtils_1 = require("./LoginUtils");
class TotpLogin {
    constructor(bot) {
        this.bot = bot;
        this.textInputSelector = 'form[name="OneTimeCodeViewForm"] input[type="text"], input#floatingLabelInput5';
        this.secondairyInputSelector = 'input[id="otc-confirmation-input"], input[name="otc"]';
        this.submitButtonSelector = 'button[type="submit"]';
        this.maxManualSeconds = 60;
        this.maxManualAttempts = 5;
    }
    generateTotpCode(secret) {
        return new OTPAuth.TOTP({ secret, digits: 6 }).generate();
    }
    async fillCode(page, code) {
        try {
            const visibleInput = await page
                .waitForSelector(this.textInputSelector, { state: 'visible', timeout: 500 })
                .catch(() => null);
            if (visibleInput) {
                await visibleInput.fill(code);
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'Filled TOTP input');
                return true;
            }
            const secondairyInput = await page.$(this.secondairyInputSelector);
            if (secondairyInput) {
                await secondairyInput.fill(code);
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'Filled TOTP input');
                return true;
            }
            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-TOTP', 'No TOTP input field found');
            return false;
        }
        catch (error) {
            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-TOTP', `Failed to fill TOTP input: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    async handle(page, totpSecret) {
        try {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', '请求TOTP双因素身份验证');
            if (totpSecret) {
                const code = this.generateTotpCode(totpSecret);
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', '从密钥生成TOTP代码');
                const filled = await this.fillCode(page, code);
                if (!filled) {
                    this.bot.logger.error(this.bot.isMobile, 'LOGIN-TOTP', '无法填写TOTP输入字段');
                    throw new Error('未找到TOTP输入字段');
                }
                await this.bot.utils.wait(500);
                await this.bot.browser.utils.ghostClick(page, this.submitButtonSelector);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
                const errorMessage = await (0, LoginUtils_1.getErrorMessage)(page);
                if (errorMessage) {
                    this.bot.logger.error(this.bot.isMobile, 'LOGIN-TOTP', `TOTP失败: ${errorMessage}`);
                    throw new Error(`TOTP身份验证失败: ${errorMessage}`);
                }
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'TOTP身份验证成功完成');
                return;
            }
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', '未提供TOTP密钥，等待手动输入');
            for (let attempt = 1; attempt <= this.maxManualAttempts; attempt++) {
                const code = await (0, LoginUtils_1.promptInput)({
                    question: `输入6位TOTP代码 (等待 ${this.maxManualSeconds}秒): `,
                    timeoutSeconds: this.maxManualSeconds,
                    validate: code => /^\d{6}$/.test(code)
                });
                if (!code || !/^\d{6}$/.test(code)) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN-TOTP', `无效或缺少代码 (尝试 ${attempt}/${this.maxManualAttempts}) | 输入长度=${code?.length}`);
                    if (attempt === this.maxManualAttempts) {
                        throw new Error('手动TOTP输入失败或超时');
                    }
                    continue;
                }
                const filled = await this.fillCode(page, code);
                if (!filled) {
                    this.bot.logger.error(this.bot.isMobile, 'LOGIN-TOTP', `无法填写TOTP输入 (尝试 ${attempt}/${this.maxManualAttempts})`);
                    if (attempt === this.maxManualAttempts) {
                        throw new Error('未找到TOTP输入字段');
                    }
                    continue;
                }
                await this.bot.utils.wait(500);
                await this.bot.browser.utils.ghostClick(page, this.submitButtonSelector);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
                // 检查是否输入了错误代码
                const errorMessage = await (0, LoginUtils_1.getErrorMessage)(page);
                if (errorMessage) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN-TOTP', `代码不正确: ${errorMessage} (尝试 ${attempt}/${this.maxManualAttempts})`);
                    if (attempt === this.maxManualAttempts) {
                        throw new Error(`达到最大尝试次数: ${errorMessage}`);
                    }
                    continue;
                }
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-TOTP', 'TOTP身份验证成功完成');
                return;
            }
            throw new Error(`TOTP输入在 ${this.maxManualAttempts} 次尝试后失败`);
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'LOGIN-TOTP', `发生错误: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
}
exports.TotpLogin = TotpLogin;
//# sourceMappingURL=Totp2FALogin.js.map