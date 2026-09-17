import type { Cookie, Page } from 'patchright';
import type { MicrosoftRewardsBot } from '../../index';
import { EmailLogin } from './methods/EmailLogin';
import { PasswordlessLogin } from './methods/PasswordlessLogin';
import { TotpLogin } from './methods/Totp2FALogin';
import { CodeLogin } from './methods/GetACodeLogin';
import { RecoveryLogin } from './methods/RecoveryEmailLogin';
import type { Account } from '../../interface/Account';
export type LoginState = 'EMAIL_INPUT' | 'PASSWORD_INPUT' | 'SIGN_IN_ANOTHER_WAY' | 'SIGN_IN_ANOTHER_WAY_EMAIL' | 'PASSKEY_ERROR' | 'PASSKEY_VIDEO' | 'KMSI_PROMPT' | 'LOGGED_IN' | 'REWARDS_SIGN_IN' | 'RECOVERY_EMAIL_INPUT' | 'ACCOUNT_LOCKED' | 'ERROR_ALERT' | '2FA_TOTP' | 'LOGIN_PASSWORDLESS' | 'GET_A_CODE' | 'GET_A_CODE_2' | 'OTP_CODE_ENTRY' | 'UNKNOWN' | 'CHROMEWEBDATA_ERROR';
export declare const LOGIN_ERROR_ALERT_SELECTOR = "div[role=\"alert\"]:not(#wcpConsentBannerCtrl):not(#__next-route-announcer__)";
export declare const PASSWORD_SIGN_IN_OPTION_SELECTOR = "[data-testid=\"tile\"]:has(svg path[d*=\"M11.78 10.22a.75.75\"]), [role=\"button\"]:has-text(\"Use your password\"), [role=\"button\"]:has-text(\"\u4F7F\u7528\u5BC6\u7801\"), [role=\"button\"]:has-text(\"\u4F7F\u7528\u4F60\u7684\u5BC6\u7801\")";
export declare const REWARDS_SIGN_IN_SELECTOR = "a[href*=\"login.live.com\"], a[href*=\"/signin\"], button:has-text(\"Sign in\"), a:has-text(\"Sign in\"), button:has-text(\"\u767B\u5F55\"), a:has-text(\"\u767B\u5F55\")";
export interface LoginErrorSnapshot {
    innerText: string;
    textContent: string;
    ariaLabel: string;
    title: string;
    errorMessage: string;
    url: string;
    host: string;
    path: string;
}
interface LoginStateErrorOptions extends Partial<LoginErrorSnapshot> {
    loginStage?: string;
}
export declare function captureLoginErrorSnapshot(page: Page, selector?: string): Promise<LoginErrorSnapshot | null>;
export declare class LoginStateError extends Error {
    readonly loginState: LoginState;
    readonly loginStage: string;
    readonly errorMessage: string;
    readonly url: string;
    readonly host: string;
    readonly path: string;
    constructor(loginState: LoginState, message: string, options?: string | LoginStateErrorOptions);
}
export declare function selectDetectedLoginState(foundStates: LoginState[]): LoginState;
export declare function rewardsDashboardUrl(baseUrl: string): string;
export declare function classifyRewardsPageLoginState(rawUrl: string, hasVisibleSignInControl: boolean): 'REWARDS_SIGN_IN' | 'LOGGED_IN' | 'UNKNOWN' | null;
export declare function isKmsiPromptText(text: string): boolean;
export declare function hasBingAuthenticationCookies(cookies: Array<Pick<Cookie, 'name' | 'domain' | 'expires'>>, nowSeconds?: number): boolean;
export declare class Login {
    private bot;
    emailLogin: EmailLogin;
    passwordlessLogin: PasswordlessLogin;
    totp2FALogin: TotpLogin;
    codeLogin: CodeLogin;
    recoveryLogin: RecoveryLogin;
    private readonly selectors;
    constructor(bot: MicrosoftRewardsBot);
    login(page: Page, account: Account): Promise<void>;
    private detectCurrentState;
    private checkSelector;
    private checkAnySelector;
    private hasBingSessionEvidence;
    private handleState;
    private finalizeLogin;
    verifyBingSession(page: Page, account: Account): Promise<void>;
    private getRewardsSession;
    getAppAccessToken(page: Page, email: string): Promise<string>;
}
export {};
//# sourceMappingURL=Login.d.ts.map