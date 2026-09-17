"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Login = exports.LoginStateError = exports.REWARDS_SIGN_IN_SELECTOR = exports.PASSWORD_SIGN_IN_OPTION_SELECTOR = exports.LOGIN_ERROR_ALERT_SELECTOR = void 0;
exports.captureLoginErrorSnapshot = captureLoginErrorSnapshot;
exports.selectDetectedLoginState = selectDetectedLoginState;
exports.rewardsDashboardUrl = rewardsDashboardUrl;
exports.classifyRewardsPageLoginState = classifyRewardsPageLoginState;
exports.isKmsiPromptText = isKmsiPromptText;
exports.hasBingAuthenticationCookies = hasBingAuthenticationCookies;
const Load_1 = require("../../util/Load");
const MobileAccessLogin_1 = require("./methods/MobileAccessLogin");
const EmailLogin_1 = require("./methods/EmailLogin");
const PasswordlessLogin_1 = require("./methods/PasswordlessLogin");
const Totp2FALogin_1 = require("./methods/Totp2FALogin");
const GetACodeLogin_1 = require("./methods/GetACodeLogin");
const RecoveryEmailLogin_1 = require("./methods/RecoveryEmailLogin");
exports.LOGIN_ERROR_ALERT_SELECTOR = 'div[role="alert"]:not(#wcpConsentBannerCtrl):not(#__next-route-announcer__)';
exports.PASSWORD_SIGN_IN_OPTION_SELECTOR = [
    '#idA_PWD_SwitchToPassword',
    '#idA_PWD_SwitchToPasswordLink',
    '[data-testid="tile"]:has(svg path[d*="M11.78 10.22a.75.75"])',
    '[data-testid="tile"]:has-text("密码")',
    '[data-testid="tile"]:has-text("密碼")',
    '[data-testid="tile"]:has-text("Password")',
    '[role="button"]:has-text("Use your password")',
    '[role="button"]:has-text("使用密码")',
    '[role="button"]:has-text("使用你的密码")',
    '[role="button"]:has-text("使用您的密码")',
    '[role="button"]:has-text("使用您的密碼")',
    'button:has-text("使用你的密码")',
    'button:has-text("使用密码")',
    'button:has-text("输入密码")',
    'button:has-text("键入密码")',
    'button:has-text("Use your password")',
    'button:has-text("Enter your password")',
    'a:has-text("使用你的密码")',
    'a:has-text("使用密码")',
    'a:has-text("输入密码")',
    'a:has-text("Use your password")',
    'div[role="button"]:has-text("密码")',
    'div[role="button"]:has-text("Password")',
    'div[data-testid="credPickerOption"]:has-text("密码")',
    'div[data-testid="credPickerOption"]:has-text("Password")'
].join(', ');
exports.OTHER_WAYS_TO_SIGN_IN_SELECTOR = [
    '#idA_PWD_SwitchToCredPicker',
    '#idA_PWD_SwitchToPassword',
    'a#signInAnotherWay',
    'button#signInAnotherWay',
    'a#listOtherOptions',
    'button#listOtherOptions',
    '[data-testid="otherWaysToSignIn"]',
    '[data-testid="switchOptionLink"]',
    '[data-testid="viewFooter"] span[role="button"]',
    '[data-testid="viewFooter"] a',
    '[data-testid="viewFooter"] button',
    '[data-testid="viewFooter"] [role="button"]',
    'a:has-text("其他登录方式")',
    'button:has-text("其他登录方式")',
    'span[role="button"]:has-text("其他登录方式")',
    'a:has-text("其他登录选项")',
    'button:has-text("其他登录选项")',
    'a:has-text("其他方式")',
    'button:has-text("其他方式")',
    'span[role="button"]:has-text("其他方式")',
    'a:has-text("其他選項")',
    'button:has-text("其他選項")',
    'a:has-text("Other ways to sign in")',
    'button:has-text("Other ways to sign in")',
    'span[role="button"]:has-text("Other ways to sign in")',
    'a:has-text("Sign-in options")',
    'button:has-text("Sign-in options")',
    'span[role="button"]:has-text("Sign-in options")'
].join(', ');
exports.REWARDS_SIGN_IN_SELECTOR = 'a[href*="login.live.com"], a[href*="/signin"], button:has-text("Sign in"), a:has-text("Sign in"), button:has-text("登录"), a:has-text("登录")';
function sanitizeLoginDiagnosticText(value) {
    return String(value ?? '')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
        .replace(/([?&](?:code|access_token|refresh_token|id_token|state|RequestVerificationToken)=)[^&\s]+/gi, '$1[REDACTED]')
        .replace(/\b(password|passwd|pwd|token|secret|cookie|authorization)(\s*[:=]\s*)([^\s|]+)/gi, '$1$2[REDACTED]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
}
function loginLocation(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        const path = parsed.pathname || '/';
        return { url: `${parsed.protocol}//${parsed.host}${path}`, host: parsed.hostname, path };
    }
    catch {
        return { url: '', host: '', path: '' };
    }
}
async function captureLoginErrorSnapshot(page, selector = exports.LOGIN_ERROR_ALERT_SELECTOR) {
    const alerts = page.locator(selector);
    const count = await alerts.count().catch(() => 0);
    const candidates = [];
    for (let index = 0; index < count; index++) {
        const alert = alerts.nth(index);
        if (!(await alert.isVisible().catch(() => false)))
            continue;
        const [innerText, textContent, ariaLabel, title] = await Promise.all([
            alert.innerText().catch(() => ''),
            alert.textContent().catch(() => ''),
            alert.getAttribute('aria-label').catch(() => ''),
            alert.getAttribute('title').catch(() => '')
        ]);
        candidates.push({
            innerText: sanitizeLoginDiagnosticText(innerText),
            textContent: sanitizeLoginDiagnosticText(textContent),
            ariaLabel: sanitizeLoginDiagnosticText(ariaLabel),
            title: sanitizeLoginDiagnosticText(title)
        });
    }
    if (candidates.length === 0)
        return null;
    const selected = candidates.find(candidate => [candidate.innerText, candidate.textContent, candidate.ariaLabel, candidate.title].some(Boolean)) ?? candidates[0];
    if (!selected)
        return null;
    const location = loginLocation(page.url());
    const readable = selected.innerText || selected.textContent || selected.ariaLabel || selected.title;
    const errorMessage = readable ||
        (location.host === 'rewards.bing.com'
            ? 'Rewards 页面检测到 ERROR_ALERT，但未读取到错误文案'
            : 'Microsoft 登录页面检测到 ERROR_ALERT，但未读取到错误文案');
    return { ...selected, errorMessage, ...location };
}
class LoginStateError extends Error {
    constructor(loginState, message, options = {}) {
        const details = typeof options === 'string' ? { loginStage: options } : options;
        const fallbackMessage = sanitizeLoginDiagnosticText(message) || `登录状态 ${loginState} 失败`;
        const errorMessage = sanitizeLoginDiagnosticText(details.errorMessage) || fallbackMessage;
        super(errorMessage);
        this.name = 'LoginStateError';
        this.loginState = loginState;
        this.loginStage = details.loginStage ?? `login-${loginState.toLowerCase().replace(/_/g, '-')}`;
        this.errorMessage = errorMessage;
        this.url = details.url ?? '';
        this.host = details.host ?? '';
        this.path = details.path ?? '';
    }
}
exports.LoginStateError = LoginStateError;
function selectDetectedLoginState(foundStates) {
    if (foundStates.includes('ERROR_ALERT'))
        return 'ERROR_ALERT';
    const priorities = [
        'ACCOUNT_LOCKED',
        'PASSKEY_ERROR',
        'PASSKEY_VIDEO',
        'KMSI_PROMPT',
        'PASSWORD_INPUT',
        'EMAIL_INPUT',
        'REWARDS_SIGN_IN',
        'SIGN_IN_ANOTHER_WAY',
        'SIGN_IN_ANOTHER_WAY_EMAIL',
        'OTP_CODE_ENTRY',
        'GET_A_CODE',
        'GET_A_CODE_2',
        'LOGIN_PASSWORDLESS',
        '2FA_TOTP'
    ];
    return priorities.find(state => foundStates.includes(state)) ?? foundStates[0] ?? 'UNKNOWN';
}
function rewardsDashboardUrl(baseUrl) {
    const url = new URL(baseUrl);
    url.pathname = '/dashboard';
    url.search = '';
    url.hash = '';
    return url.toString();
}
function classifyRewardsPageLoginState(rawUrl, hasVisibleSignInControl) {
    try {
        const url = new URL(rawUrl);
        if (url.hostname !== 'rewards.bing.com')
            return null;
        if (hasVisibleSignInControl)
            return 'REWARDS_SIGN_IN';
        const loggedInPaths = ['/dashboard', '/about', '/redeem', '/earn'];
        const isLoggedInPath = loggedInPaths.some(p => url.pathname === p || url.pathname.startsWith(p + '/'));
        return isLoggedInPath ? 'LOGGED_IN' : 'UNKNOWN';
    }
    catch {
        return null;
    }
}
function isKmsiPromptText(text) {
    return /stay signed in|保持登录状态|保持登录/i.test(text);
}
function hasBingAuthenticationCookies(cookies, nowSeconds = Date.now() / 1000) {
    const names = new Set(cookies
        .filter(cookie => {
        const domain = cookie.domain.replace(/^\./u, '').toLowerCase();
        const isBingCookie = domain === 'bing.com' || domain.endsWith('.bing.com');
        const isLive = cookie.expires === -1 || cookie.expires > nowSeconds;
        return isBingCookie && isLive;
    })
        .map(cookie => cookie.name));
    return names.has('_U') && (names.has('.MSA.Auth') || names.has('WLS'));
}
class Login {
    constructor(bot) {
        this.bot = bot;
        this.selectors = {
            primaryButton: 'button[data-testid="primaryButton"], #idSIButton9',
            secondaryButton: 'button[data-testid="secondaryButton"]',
            emailIcon: '[data-testid="tile"]:has(svg path[d*="M5.25 4h13.5a3.25"])',
            emailIconOld: 'img[data-testid="accessibleImg"][src*="picker_verify_email"]',
            recoveryEmail: '[data-testid="proof-confirmation"]',
            passwordIcon: exports.PASSWORD_SIGN_IN_OPTION_SELECTOR,
            accountLocked: '#serviceAbuseLandingTitle',
            errorAlert: exports.LOGIN_ERROR_ALERT_SELECTOR,
            passwordEntry: '[data-testid="passwordEntry"], input[type="password"], input[name="passwd"]',
            emailEntry: 'input#usernameEntry, input[type="email"], input[name="loginfmt"]',
            kmsiVideo: '[data-testid="kmsiVideo"]',
            passKeyVideo: '[data-testid="biometricVideo"]',
            passKeyError: '[data-testid="registrationImg"]',
            passwordlessCheck: '[data-testid="deviceShieldCheckmarkVideo"]',
            totpInput: 'input[name="otc"]',
            totpInputOld: 'form[name="OneTimeCodeViewForm"]',
            identityBanner: '[data-testid="identityBanner"]',
            viewFooter: '[data-testid="viewFooter"] >> [role="button"]',
            otherWaysToSignIn: exports.OTHER_WAYS_TO_SIGN_IN_SELECTOR,
            otpCodeEntry: '[data-testid="codeEntry"]',
            backButton: '#back-button',
            rewardsSignIn: exports.REWARDS_SIGN_IN_SELECTOR,
            requestToken: 'input[name="__RequestVerificationToken"]',
            requestTokenMeta: 'meta[name="__RequestVerificationToken"]',
            otpInput: 'div[data-testid="codeEntry"]'
        };
        this.emailLogin = new EmailLogin_1.EmailLogin(this.bot);
        this.passwordlessLogin = new PasswordlessLogin_1.PasswordlessLogin(this.bot);
        this.totp2FALogin = new Totp2FALogin_1.TotpLogin(this.bot);
        this.codeLogin = new GetACodeLogin_1.CodeLogin(this.bot);
        this.recoveryLogin = new RecoveryEmailLogin_1.RecoveryLogin(this.bot);
    }
    async switchToPasswordLogin(page) {
        try {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN-SWITCH', '尝试自动寻找并切换到密码登录页面');
            // 1. 先检查页面上是否已有"使用密码"选项/链接/按钮
            const passwordTile = await page.waitForSelector(this.selectors.passwordIcon, { state: 'visible', timeout: 1500 }).catch(() => null);
            if (passwordTile) {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-SWITCH', '检测到"使用密码"入口，立即点击');
                await this.bot.browser.utils.ghostClick(page, this.selectors.passwordIcon);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                return true;
            }
            // 2. 检查是否有"其他登录方式"链接
            const otherWaysBtn = await page.waitForSelector(this.selectors.otherWaysToSignIn, { state: 'visible', timeout: 2000 }).catch(() => null);
            if (otherWaysBtn) {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-SWITCH', '检测到"其他登录方式"，点击展开选项列表');
                await this.bot.browser.utils.ghostClick(page, this.selectors.otherWaysToSignIn);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                await this.bot.utils.wait(1000);
                // 展开后再次查找"使用密码"
                const opt = await page.waitForSelector(this.selectors.passwordIcon, { state: 'visible', timeout: 3000 }).catch(() => null);
                if (opt) {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN-SWITCH', '在登录选项列表中找到"使用密码"，立即点击');
                    await this.bot.browser.utils.ghostClick(page, this.selectors.passwordIcon);
                    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                    return true;
                }
            }
            // 3. 检查是否有返回按钮或取消按钮
            const backBtn = await page.waitForSelector(this.selectors.backButton, { state: 'visible', timeout: 1500 }).catch(() => null);
            if (backBtn) {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN-SWITCH', '点击返回按钮尝试重置登录界面');
                await this.bot.browser.utils.ghostClick(page, this.selectors.backButton);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                return true;
            }
            return false;
        }
        catch (err) {
            this.bot.logger.warn(this.bot.isMobile, 'LOGIN-SWITCH', `切换密码登录失败: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }
    async login(page, account) {
        try {
            this.bot.logger.info(this.bot.isMobile, 'LOGIN', '开始登录流程');
            await page
                .goto(rewardsDashboardUrl(this.bot.config.baseURL), {
                waitUntil: 'domcontentloaded'
            })
                .catch(() => { });
            await this.bot.utils.wait(2000);
            await this.bot.browser.utils.reloadBadPage(page);
            await this.bot.browser.utils.disableFido(page);
            const maxIterations = 25;
            let iteration = 0;
            let previousState = 'UNKNOWN';
            let sameStateCount = 0;
            while (iteration < maxIterations) {
                if (page.isClosed())
                    throw new Error('页面意外关闭');
                iteration++;
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `状态检查迭代 ${iteration}/${maxIterations}`);
                const detection = await this.detectCurrentState(page, account);
                const state = detection.state;
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `当前状态: ${state}`);
                if (state !== previousState && previousState !== 'UNKNOWN') {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', `状态转换: ${previousState} → ${state}`);
                }
                if (state === previousState && state !== 'LOGGED_IN' && state !== 'UNKNOWN') {
                    sameStateCount++;
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `相同状态计数: ${sameStateCount}/4 状态为 "${state}"`);
                    if (sameStateCount >= 4) {
                        this.bot.logger.warn(this.bot.isMobile, 'LOGIN', `在状态 "${state}" 停滞4次循环，刷新页面`);
                        await page.reload({ waitUntil: 'domcontentloaded' });
                        await this.bot.utils.wait(3000);
                        sameStateCount = 0;
                        previousState = 'UNKNOWN';
                        continue;
                    }
                }
                else {
                    sameStateCount = 0;
                }
                previousState = state;
                if (state === 'LOGGED_IN') {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '检测到 Dashboard 登录候选，开始最终验证');
                    break;
                }
                const shouldContinue = await this.handleState(detection, page, account);
                if (!shouldContinue) {
                    throw new LoginStateError(state, `登录失败或中止于状态: ${state}`);
                }
                await this.bot.utils.wait(1000);
            }
            if (iteration >= maxIterations) {
                throw new LoginStateError(previousState, `登录超时: 超过最大迭代次数，最后状态: ${previousState}`, {
                    loginStage: 'login-timeout',
                    ...loginLocation(page.url())
                });
            }
            await this.finalizeLogin(page, account);
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'LOGIN', `致命错误: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    async detectCurrentState(page, account) {
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
        const url = new URL(page.url());
        this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `当前URL: ${url.hostname}${url.pathname}`);
        if (url.hostname === 'chromewebdata') {
            this.bot.logger.warn(this.bot.isMobile, 'DETECT-STATE', '检测到chromewebdata错误页面');
            return { state: 'CHROMEWEBDATA_ERROR' };
        }
        const isLocked = await this.checkSelector(page, this.selectors.accountLocked);
        if (isLocked) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', '账户锁定选择器被发现');
            return { state: 'ACCOUNT_LOCKED' };
        }
        const rewardsPageState = classifyRewardsPageLoginState(page.url(), await this.checkSelector(page, this.selectors.rewardsSignIn));
        if (rewardsPageState === 'REWARDS_SIGN_IN') {
            return { state: rewardsPageState };
        }
        if (rewardsPageState === 'LOGGED_IN') {
            await this.bot.browser.utils.tryDismissAllMessages(page).catch(() => { });
            return { state: rewardsPageState };
        }
        const errorSnapshot = await captureLoginErrorSnapshot(page, this.selectors.errorAlert);
        const stateChecks = [
            [this.selectors.passwordEntry, 'PASSWORD_INPUT'],
            [this.selectors.emailEntry, 'EMAIL_INPUT'],
            [this.selectors.recoveryEmail, 'RECOVERY_EMAIL_INPUT'],
            [this.selectors.passKeyVideo, 'PASSKEY_VIDEO'],
            [this.selectors.passKeyError, 'PASSKEY_ERROR'],
            [this.selectors.passwordIcon, 'SIGN_IN_ANOTHER_WAY'],
            [this.selectors.emailIcon, 'SIGN_IN_ANOTHER_WAY_EMAIL'],
            [this.selectors.emailIconOld, 'SIGN_IN_ANOTHER_WAY_EMAIL'],
            [this.selectors.passwordlessCheck, 'LOGIN_PASSWORDLESS'],
            [this.selectors.totpInput, '2FA_TOTP'],
            [this.selectors.totpInputOld, '2FA_TOTP'],
            [this.selectors.otpCodeEntry, 'OTP_CODE_ENTRY'], // PR 450
            [this.selectors.otpInput, 'OTP_CODE_ENTRY'] // 我的修复
        ];
        const results = await Promise.all(stateChecks.map(async ([sel, state]) => {
            const visible = await this.checkSelector(page, sel);
            return visible ? state : null;
        }));
        if ((await this.checkSelector(page, this.selectors.kmsiVideo)) ||
            ((await this.checkSelector(page, this.selectors.primaryButton)) &&
                isKmsiPromptText(await page
                    .locator('body')
                    .innerText()
                    .catch(() => '')))) {
            results.push('KMSI_PROMPT');
        }
        if (errorSnapshot)
            results.push('ERROR_ALERT');
        const visibleStates = results.filter((s) => s !== null);
        if (visibleStates.length > 0) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `可见状态: [${visibleStates.join(', ')}]`);
        }
        const [identityBanner, primaryButton, passwordEntry] = await Promise.all([
            this.checkSelector(page, this.selectors.identityBanner),
            this.checkSelector(page, this.selectors.primaryButton),
            this.checkSelector(page, this.selectors.passwordEntry)
        ]);
        if (identityBanner && primaryButton && !passwordEntry && !results.includes('2FA_TOTP')) {
            const codeState = account?.password ? 'GET_A_CODE' : 'GET_A_CODE_2';
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `检测到获取代码状态: ${codeState} (有密码: ${!!account?.password})`);
            results.push(codeState);
        }
        if (!passwordEntry && !results.includes('PASSWORD_INPUT') && !results.includes('EMAIL_INPUT') && account?.password) {
            const hasPasswordOption = await this.checkSelector(page, this.selectors.passwordIcon);
            const hasOtherWays = await this.checkSelector(page, this.selectors.otherWaysToSignIn);
            if (hasPasswordOption) {
                this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', '检测到"使用密码"选项，标记为 SIGN_IN_ANOTHER_WAY');
                results.push('SIGN_IN_ANOTHER_WAY');
            }
            else if (hasOtherWays) {
                this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', '检测到非密码页面但有"其他登录方式"，标记为 GET_A_CODE 以触发密码切换');
                results.push('GET_A_CODE');
            }
        }
        const foundStates = results.filter((s) => s !== null);
        if (foundStates.length === 0 && rewardsPageState) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `Rewards 页面状态: ${rewardsPageState} (${url.hostname}${url.pathname})`);
            return { state: rewardsPageState };
        }
        if (foundStates.length === 0) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', '未找到匹配的状态');
            return { state: 'UNKNOWN' };
        }
        if (foundStates.includes('ERROR_ALERT')) {
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `发现ERROR_ALERT - 主机名: ${url.hostname}, 有2FA: ${foundStates.includes('2FA_TOTP')}`);
            this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `ERROR_ALERT 快照 | 状态=ERROR_ALERT | 位置=${errorSnapshot?.host || 'unknown'}${errorSnapshot?.path || ''} | 文案=${errorSnapshot?.errorMessage || '未捕获'}`);
            return errorSnapshot ? { state: 'ERROR_ALERT', errorSnapshot } : { state: 'ERROR_ALERT' };
        }
        const selected = selectDetectedLoginState(foundStates);
        this.bot.logger.debug(this.bot.isMobile, 'DETECT-STATE', `按优先级选择状态: ${selected}`);
        return { state: selected };
    }
    async checkSelector(page, selector) {
        return page
            .waitForSelector(selector, { state: 'visible', timeout: 200 })
            .then(() => true)
            .catch(() => false);
    }
    async checkAnySelector(page, selectors) {
        const matches = await Promise.all(selectors.map(selector => this.checkSelector(page, selector)));
        return matches.some(Boolean);
    }
    async hasBingSessionEvidence(page) {
        const [identityText, visibleProfile, cookies] = await Promise.all([
            page
                .locator('#id_n')
                .first()
                .textContent()
                .catch(() => ''),
            this.checkAnySelector(page, ['#id_avatar', '.id_avatar']),
            page
                .context()
                .cookies(['https://www.bing.com/', 'https://cn.bing.com/'])
                .catch(() => [])
        ]);
        const normalizedIdentity = identityText?.trim() ?? '';
        const hasIdentityNode = Boolean(normalizedIdentity) && !/sign in|登录/iu.test(normalizedIdentity);
        const hasAuthenticationCookies = hasBingAuthenticationCookies(cookies);
        this.bot.logger.debug(this.bot.isMobile, 'LOGIN-BING', `身份信号: identity=${hasIdentityNode} | visibleProfile=${visibleProfile} | authCookies=${hasAuthenticationCookies}`);
        return hasAuthenticationCookies && (hasIdentityNode || visibleProfile);
    }
    async handleState(detection, page, account) {
        const state = detection.state;
        this.bot.logger.debug(this.bot.isMobile, 'HANDLE-STATE', `处理状态: ${state}`);
        switch (state) {
            case 'ACCOUNT_LOCKED': {
                const msg = '此账户已被锁定！从配置中移除并重新启动！';
                this.bot.logger.error(this.bot.isMobile, 'LOGIN', msg);
                throw new LoginStateError(state, msg, { ...loginLocation(page.url()) });
            }
            case 'ERROR_ALERT': {
                const snapshot = detection.errorSnapshot ?? {
                    innerText: '',
                    textContent: '',
                    ariaLabel: '',
                    title: '',
                    errorMessage: 'Rewards 页面检测到 ERROR_ALERT，但未读取到错误文案',
                    ...loginLocation(page.url())
                };
                this.bot.logger.error(this.bot.isMobile, 'LOGIN', `登录错误 | 状态=${state} | 阶段=login-error-alert | 位置=${snapshot.host}${snapshot.path} | 文案=${snapshot.errorMessage}`);
                throw new LoginStateError(state, snapshot.errorMessage, {
                    ...snapshot,
                    loginStage: 'login-error-alert'
                });
            }
            case 'LOGGED_IN':
                return true;
            case 'REWARDS_SIGN_IN': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Rewards 页面尚未登录，点击登录入口');
                const signIn = await page
                    .waitForSelector(this.selectors.rewardsSignIn, { state: 'visible', timeout: 3000 })
                    .catch(() => null);
                if (!signIn) {
                    throw new LoginStateError(state, 'Rewards 登录入口已消失，无法继续登录', {
                        loginStage: 'rewards-sign-in',
                        ...loginLocation(page.url())
                    });
                }
                await signIn.click();
                await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => { });
                return true;
            }
            case 'EMAIL_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '输入邮箱');
                await this.emailLogin.enterEmail(page, account.email);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', '邮箱输入后网络空闲超时');
                });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '邮箱输入成功');
                return true;
            }
            case 'PASSWORD_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '输入密码');
                await this.emailLogin.enterPassword(page, account.password);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', '密码输入后网络空闲超时');
                });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '密码输入成功');
                return true;
            }
            case 'GET_A_CODE': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '检测到非密码/获取代码页面，尝试切换到密码登录');
                const switched = await this.switchToPasswordLogin(page);
                if (switched) {
                    return true;
                }
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '未找到可用的"其他登录方式/使用密码"选项，尝试点击返回按钮');
                const backBtn = await page
                    .waitForSelector(this.selectors.backButton, { state: 'visible', timeout: 2000 })
                    .catch(() => null);
                if (backBtn) {
                    await this.bot.browser.utils.ghostClick(page, this.selectors.backButton);
                    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
                    return true;
                }
                return true;
            }
            case 'GET_A_CODE_2': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '处理"获取代码"流程');
                await this.bot.browser.utils.ghostClick(page, this.selectors.primaryButton);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', '主按钮点击后网络空闲超时');
                });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '启动代码登录处理器');
                await this.codeLogin.handle(page);
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '代码登录处理器完成');
                return true;
            }
            case 'SIGN_IN_ANOTHER_WAY_EMAIL': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '选择"发送代码到邮箱"');
                const emailSelector = await Promise.race([
                    this.checkSelector(page, this.selectors.emailIcon).then(found => found ? this.selectors.emailIcon : null),
                    this.checkSelector(page, this.selectors.emailIconOld).then(found => found ? this.selectors.emailIconOld : null)
                ]);
                if (!emailSelector) {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '未找到邮箱图标');
                    return false;
                }
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', `使用${emailSelector === this.selectors.emailIcon ? '新' : '旧'}邮箱图标选择器`);
                await this.bot.browser.utils.ghostClick(page, emailSelector);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', '邮箱图标点击后网络空闲超时');
                });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '启动代码登录处理器');
                await this.codeLogin.handle(page);
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '代码登录处理器完成');
                return true;
            }
            case 'RECOVERY_EMAIL_INPUT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '检测到恢复邮箱输入');
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', '恢复页面网络空闲超时');
                });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '启动恢复邮箱处理器');
                await this.recoveryLogin.handle(page, account?.recoveryEmail);
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '恢复邮箱处理器完成');
                return true;
            }
            case 'CHROMEWEBDATA_ERROR': {
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '检测到chromewebdata错误，尝试恢复');
                try {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', `导航到 ${this.bot.config.baseURL}`);
                    await page
                        .goto(this.bot.config.baseURL, {
                        waitUntil: 'domcontentloaded',
                        timeout: 10000
                    })
                        .catch(() => { });
                    await this.bot.utils.wait(3000);
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '恢复导航成功');
                    return true;
                }
                catch {
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '回退到login.live.com');
                    await page
                        .goto('https://login.live.com/', {
                        waitUntil: 'domcontentloaded',
                        timeout: 10000
                    })
                        .catch(() => { });
                    await this.bot.utils.wait(3000);
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '回退导航成功');
                    return true;
                }
            }
            case '2FA_TOTP': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '需要TOTP双因素认证');
                await this.totp2FALogin.handle(page, account.totpSecret);
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'TOTP双因素认证处理器完成');
                return true;
            }
            case 'SIGN_IN_ANOTHER_WAY': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '选择"使用我的密码"');
                await this.bot.browser.utils.ghostClick(page, this.selectors.passwordIcon);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', '密码图标点击后网络空闲超时');
                });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '密码选项已选择');
                return true;
            }
            case 'KMSI_PROMPT': {
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '接受KMSI提示');
                await this.bot.browser.utils.ghostClick(page, this.selectors.primaryButton);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'KMSI接受后网络空闲超时');
                });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'KMSI提示已接受');
                return true;
            }
            case 'PASSKEY_ERROR': {
                if (account?.password) {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '检测到通行密钥错误，尝试切换到密码登录');
                    const switched = await this.switchToPasswordLogin(page);
                    if (switched) {
                        return true;
                    }
                }
                throw new LoginStateError(state, '微软登录通行密钥流程返回错误', {
                    loginStage: 'login-passkey-error',
                    ...loginLocation(page.url())
                });
            }
            case 'PASSKEY_VIDEO': {
                if (account?.password) {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '检测到Passkey提示，优先尝试切换到密码登录');
                    const switched = await this.switchToPasswordLogin(page);
                    if (switched) {
                        return true;
                    }
                }
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '跳过Passkey提示');
                await this.bot.browser.utils.ghostClick(page, this.selectors.secondaryButton);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'Passkey跳过后网络空闲超时');
                });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', 'Passkey提示已跳过');
                return true;
            }
            case 'LOGIN_PASSWORDLESS': {
                if (account?.password) {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '检测到无密码认证，但账户已配置密码，优先尝试切换到密码登录');
                    const switched = await this.switchToPasswordLogin(page);
                    if (switched) {
                        return true;
                    }
                    this.bot.logger.warn(this.bot.isMobile, 'LOGIN', '未找到密码选项，回退到无密码等待批准流程');
                }
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '处理无密码认证');
                await this.passwordlessLogin.handle(page);
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', '无密码认证后网络空闲超时');
                });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '无密码认证完成');
                return true;
            }
            case 'OTP_CODE_ENTRY': {
                if (account?.password) {
                    this.bot.logger.info(this.bot.isMobile, 'LOGIN', '检测到OTP代码输入页面，优先尝试查找密码选项');
                    const switched = await this.switchToPasswordLogin(page);
                    if (switched) {
                        return true;
                    }
                }
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN', 'OTP页面上未找到密码导航选项');
                await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN', 'OTP导航后网络空闲超时');
                });
                this.bot.logger.info(this.bot.isMobile, 'LOGIN', '从OTP输入页面返回');
                return true;
            }
            case 'UNKNOWN': {
                const url = new URL(page.url());
                this.bot.logger.warn(this.bot.isMobile, 'LOGIN', `在 ${url.hostname}${url.pathname} 的未知状态，等待中`);
                if (account?.password && (url.hostname.includes('login.live.com') || url.hostname.includes('login.microsoftonline.com') || url.hostname.includes('bing.com'))) {
                    const hasPassword = await this.checkSelector(page, this.selectors.passwordEntry);
                    if (!hasPassword) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN', '未知状态且无密码框，主动尝试扫描并切换到密码登录');
                        const switched = await this.switchToPasswordLogin(page);
                        if (switched) {
                            return true;
                        }
                    }
                }
                return true;
            }
            default:
                this.bot.logger.debug(this.bot.isMobile, 'HANDLE-STATE', `未处理的状态: ${state}，继续执行`);
                return true;
        }
    }
    async finalizeLogin(page, account) {
        this.bot.logger.info(this.bot.isMobile, 'LOGIN', '开始最终登录验证');
        this.bot.logger.info(this.bot.isMobile, 'LOGIN', '开始Bing会话验证');
        await this.verifyBingSession(page, account);
        this.bot.logger.info(this.bot.isMobile, 'LOGIN', '开始奖励会话验证');
        await this.getRewardsSession(page);
        const browser = page.context();
        const cookies = await browser.cookies();
        this.bot.logger.debug(this.bot.isMobile, 'LOGIN', `检索到 ${cookies.length} 个cookie`);
        await (0, Load_1.saveSessionData)(this.bot.config.sessionPath, cookies, account.email, this.bot.isMobile);
        this.bot.browser.func.markSessionVerified(browser);
        this.bot.logger.info(this.bot.isMobile, 'LOGIN', '登录完成，会话已保存');
    }
    async verifyBingSession(page, account) {
        const url = 'https://www.bing.com/fd/auth/signin?action=interactive&provider=windows_live_id&return_url=https%3A%2F%2Fwww.bing.com%2F';
        const loopMax = 15;
        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', '验证Bing会话');
        try {
            await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => { });
            for (let i = 0; i < loopMax; i++) {
                if (page.isClosed())
                    break;
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN-BING', `验证循环 ${i + 1}/${loopMax}`);
                const u = new URL(page.url());
                const atBingHome = ['cn.bing.com', 'www.bing.com'].includes(u.hostname) && u.pathname === '/';
                this.bot.logger.debug(this.bot.isMobile, 'LOGIN-BING', `在Bing首页: ${atBingHome} (${u.hostname}${u.pathname})`);
                if (atBingHome) {
                    await this.bot.browser.utils.tryDismissAllMessages(page).catch(() => { });
                    const signedIn = await this.hasBingSessionEvidence(page);
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN-BING', `找到个人资料元素: ${signedIn}`);
                    if (signedIn) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', 'Bing会话验证成功');
                        return;
                    }
                    // Cookie-only 回退: 在首页但视觉元素未找到时，仅凭 cookie 验证
                    if (i >= 3) {
                        const fallbackCookies = await page.context().cookies(['https://www.bing.com/', 'https://cn.bing.com/']).catch(() => []);
                        if (hasBingAuthenticationCookies(fallbackCookies)) {
                            this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', 'Cookie回退验证通过（首页视觉元素未找到但cookie有效），Bing会话验证成功');
                            return;
                        }
                    }
                }
                // 处理 Bing 认证/身份验证中间页面（/fd/auth/、/identity/ 等）
                const isBingDomain = ['cn.bing.com', 'www.bing.com'].includes(u.hostname);
                const isBingAuthPage = isBingDomain && !atBingHome && (
                    u.pathname.startsWith('/fd/auth/') ||
                    u.pathname.startsWith('/identity/') ||
                    u.pathname.startsWith('/secure/')
                );
                if (isBingAuthPage) {
                    this.bot.logger.debug(this.bot.isMobile, 'LOGIN-BING', `在Bing认证中间页: ${u.hostname}${u.pathname}`);
                    // 等待页面可能的自动重定向
                    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
                    const afterUrl = new URL(page.url());
                    const afterAtHome = ['cn.bing.com', 'www.bing.com'].includes(afterUrl.hostname) && afterUrl.pathname === '/';
                    if (afterAtHome) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', '认证页面已自动重定向到首页');
                        continue;
                    }
                    // 检查是否已有认证 cookie，有则直接导航到首页
                    const authCookies = await page.context().cookies(['https://www.bing.com/', 'https://cn.bing.com/']).catch(() => []);
                    if (hasBingAuthenticationCookies(authCookies)) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', '认证中间页已有Bing cookie，直接导航到首页');
                        await page.goto('https://www.bing.com/', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
                        await this.bot.utils.wait(2000);
                        continue;
                    }
                    // 多次尝试后直接导航
                    if (i >= 3) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', `第 ${i + 1} 次循环仍在认证中间页，直接导航到首页`);
                        await page.goto('https://www.bing.com/', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
                        await this.bot.utils.wait(3000);
                        continue;
                    }
                }
                // 非首页、非认证页时的 Cookie 回退
                if (isBingDomain && !atBingHome && i >= 6) {
                    const domainCookies = await page.context().cookies(['https://www.bing.com/', 'https://cn.bing.com/']).catch(() => []);
                    if (hasBingAuthenticationCookies(domainCookies)) {
                        this.bot.logger.info(this.bot.isMobile, 'LOGIN-BING', 'Cookie回退验证通过（非首页但cookie有效），Bing会话验证成功');
                        return;
                    }
                }
                const detection = await this.detectCurrentState(page, account);
                const state = detection.state;
                if (state === 'PASSKEY_ERROR') {
                    throw new LoginStateError(state, 'Bing 会话验证遇到通行密钥错误', {
                        loginStage: 'bing-session-passkey-error',
                        ...loginLocation(page.url())
                    });
                }
                if (state === 'ERROR_ALERT') {
                    const snapshot = detection.errorSnapshot ?? {
                        innerText: '',
                        textContent: '',
                        ariaLabel: '',
                        title: '',
                        errorMessage: 'Bing 会话检测到 ERROR_ALERT，但未读取到错误文案',
                        ...loginLocation(page.url())
                    };
                    throw new LoginStateError(state, snapshot.errorMessage, {
                        ...snapshot,
                        loginStage: 'bing-session-error'
                    });
                }
                if (state !== 'UNKNOWN' && state !== 'LOGGED_IN' && state !== 'CHROMEWEBDATA_ERROR') {
                    await this.handleState(detection, page, account);
                }
                await this.bot.utils.wait(1000);
            }
            throw new LoginStateError('UNKNOWN', 'Bing 会话验证超时，未确认登录状态', {
                loginStage: 'bing-session-timeout',
                ...loginLocation(page.url())
            });
        }
        catch (error) {
            this.bot.logger.error(this.bot.isMobile, 'LOGIN-BING', `验证错误: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    async getRewardsSession(page) {
        const loopMax = 8;
        this.bot.logger.info(this.bot.isMobile, 'GET-REWARD-SESSION', '获取请求令牌');
        try {
            await page
                .goto(`${rewardsDashboardUrl(this.bot.config.baseURL)}?_=${Date.now()}`, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            })
                .catch(() => { });
            for (let i = 0; i < loopMax; i++) {
                if (page.isClosed())
                    break;
                this.bot.logger.debug(this.bot.isMobile, 'GET-REWARD-SESSION', `令牌获取循环 ${i + 1}/${loopMax}`);
                const u = new URL(page.url());
                const atRewardHome = u.hostname === 'rewards.bing.com' && u.pathname === '/dashboard';
                const atRewardsPage = u.hostname === 'rewards.bing.com' && (u.pathname === '/dashboard' || u.pathname.startsWith('/dashboard/') || u.pathname === '/about' || u.pathname.startsWith('/about/'));
                // 如果在 rewards.bing.com 但不在 /dashboard，尝试导航到 /dashboard
                if (atRewardsPage && !atRewardHome) {
                    this.bot.logger.debug(this.bot.isMobile, 'GET-REWARD-SESSION', `在Rewards页面但不在dashboard: ${u.pathname}，尝试导航到dashboard`);
                    await page.goto(`${rewardsDashboardUrl(this.bot.config.baseURL)}?_=${Date.now()}`, {
                        waitUntil: 'domcontentloaded',
                        timeout: 15000
                    }).catch(() => { });
                    await this.bot.utils.wait(2000);
                    const afterUrl = new URL(page.url());
                    if (afterUrl.hostname === 'rewards.bing.com' && afterUrl.pathname !== '/dashboard') {
                        this.bot.logger.debug(this.bot.isMobile, 'GET-REWARD-SESSION', `导航后仍不在dashboard: ${afterUrl.pathname}`);
                    }
                    continue;
                }
                if (atRewardHome) {
                    await this.bot.browser.utils.tryDismissAllMessages(page);
                    const [signInVisible, dashboardSurfaceVisible] = await Promise.all([
                        this.checkSelector(page, this.selectors.rewardsSignIn),
                        this.checkSelector(page, 'section#dailyset, #daily-sets, main section, main article, [data-testid*="dashboard" i], [class*="point" i], div[class*="reward" i], div[class*="streak" i], [data-testid*="point" i], script[src*="/_next/"]')
                    ]);
                    if (signInVisible || !dashboardSurfaceVisible) {
                        // 在第3次循环后，如果页面在 /dashboard 并且没有登录入口，直接通过
                        if (i >= 2 && !signInVisible) {
                            this.bot.logger.info(this.bot.isMobile, 'GET-REWARD-SESSION', `Dashboard页面证据不足但无登录入口，降级通过 | 循环=${i + 1}`);
                        }
                        else {
                            this.bot.logger.debug(this.bot.isMobile, 'GET-REWARD-SESSION', `Dashboard 页面证据不足 | 登录入口=${signInVisible} | 内容区=${dashboardSurfaceVisible}`);
                            await this.bot.utils.wait(1000);
                            continue;
                        }
                    }
                    const html = await page.content();
                    const $ = await this.bot.browser.utils.loadInCheerio(html);
                    // 检查当前使用的是哪个版本的仪表板，在新版仪表板上禁用 requestToken 请求。
                    // 新版 Rewards 使用 Next.js App Router，页面经常不再包含 __RequestVerificationToken。
                    const isModernDashboard = $('section#dailyset').length > 0 ||
                        $('script[src*="/_next/"]').length > 0 ||
                        html.includes('self.__next_f') ||
                        html.includes('__NEXT_DATA__') ||
                        /[?&]dpl=\d+-\d+/.test(html);
                    if (isModernDashboard) {
                        this.bot.rewardsVersion = 'modern';
                        this.bot.logger.info(this.bot.isMobile, 'GET-REWARD-SESSION', '检测到现代 Rewards 仪表板，RequestVerificationToken 不是必需项');
                    }
                    const token = $(this.selectors.requestToken).attr('value') ??
                        $(this.selectors.requestTokenMeta).attr('content') ??
                        null;
                    if (token) {
                        this.bot.requestToken = token;
                        this.bot.logger.info(this.bot.isMobile, 'GET-REWARD-SESSION', '请求令牌已获取');
                        return;
                    }
                    if (isModernDashboard) {
                        this.bot.logger.info(this.bot.isMobile, 'GET-REWARD-SESSION', '现代仪表板未提供 RequestVerificationToken，已按预期跳过旧版令牌获取');
                        return;
                    }
                    this.bot.logger.debug(this.bot.isMobile, 'GET-REWARD-SESSION', '页面上未找到令牌');
                }
                else {
                    this.bot.logger.debug(this.bot.isMobile, 'GET-REWARD-SESSION', `不在奖励首页: ${u.hostname}${u.pathname}`);
                }
                await this.bot.utils.wait(1000);
            }
            // 最终回退: 如果循环结束后仍在 rewards 页面，尝试降级通过
            const finalUrl = new URL(page.url());
            if (finalUrl.hostname === 'rewards.bing.com') {
                this.bot.logger.warn(this.bot.isMobile, 'GET-REWARD-SESSION', '循环结束但仍在Rewards页面，尝试降级通过');
                const html = await page.content();
                const isModern = html.includes('self.__next_f') || html.includes('__NEXT_DATA__') || html.includes('/_next/');
                if (isModern) {
                    this.bot.rewardsVersion = 'modern';
                    this.bot.logger.info(this.bot.isMobile, 'GET-REWARD-SESSION', '现代仪表板未找到 RequestVerificationToken，继续使用 Cookie / Server Action 流程');
                    return;
                }
            }
            throw new LoginStateError('UNKNOWN', 'Rewards dashboard 会话验证失败', {
                loginStage: 'rewards-session-error',
                ...loginLocation(page.url())
            });
        }
        catch (error) {
            throw this.bot.logger.error(this.bot.isMobile, 'GET-REWARD-SESSION', `致命错误: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getAppAccessToken(page, email) {
        this.bot.logger.info(this.bot.isMobile, 'GET-APP-TOKEN', '请求移动访问令牌');
        return await new MobileAccessLogin_1.MobileAccessLogin(this.bot, page).get(email);
    }
}
exports.Login = Login;
//# sourceMappingURL=Login.js.map